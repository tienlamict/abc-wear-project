import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  HttpMainSystemClient,
  MainSystemError,
  syncCatalog,
  syncStock,
} from "@/modules/integration";
import seedJson from "../../mock-main/seed.json";
import type { Seed } from "../../mock-main/types";
import { resetCatalog, startMockMain } from "./helpers";

const seed = seedJson as Seed;
const seedVariants = seed.products.flatMap((p) => p.variants);

describe("syncCatalog / syncStock against the real mock Main System", () => {
  let mock: Awaited<ReturnType<typeof startMockMain>>;
  let client: HttpMainSystemClient;

  beforeAll(async () => {
    mock = await startMockMain();
    client = new HttpMainSystemClient({ baseUrl: mock.baseUrl, timeoutMs: 3000 });
  });
  afterAll(async () => {
    await mock.app.close();
    await prisma.$disconnect();
  });
  beforeEach(resetCatalog);

  it("IF-01 loads every category, product and variant from the seed", async () => {
    const result = await syncCatalog(client);
    expect(result).toEqual({
      categories: 6,
      products: 40,
      variants: seedVariants.length,
      deactivated: 0,
    });

    expect(await prisma.category.count()).toBe(6);
    expect(await prisma.category.count({ where: { parentId: null } })).toBe(2);
    expect(await prisma.product.count({ where: { isActive: true } })).toBe(40);
    expect(await prisma.productVariant.count()).toBe(seedVariants.length);

    const p001 = await prisma.product.findUniqueOrThrow({
      where: { id: "P001" },
      include: { variants: true },
    });
    const seedP001 = seed.products.find((p) => p.id === "P001")!;
    expect(p001.name).toBe(seedP001.name);
    expect(p001.createdAt.toISOString()).toBe(seedP001.createdAt);
    expect(p001.images).toEqual(seedP001.images.map((path) => mock.baseUrl + path));
    expect(p001.variants).toHaveLength(seedP001.variants.length);
    // Stock is not part of IF-01.
    expect(p001.variants.every((v) => v.availableQty === 0)).toBe(true);

    const logs = await prisma.syncLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ direction: "IN", iface: "IF-01", result: "OK" });
  });

  it("is idempotent: a second run creates no duplicates and logs again", async () => {
    await syncCatalog(client);
    await syncCatalog(client);
    expect(await prisma.product.count()).toBe(40);
    expect(await prisma.productVariant.count()).toBe(seedVariants.length);
    expect(await prisma.syncLog.count({ where: { iface: "IF-01", result: "OK" } })).toBe(2);
  });

  it("IF-02 copies stock levels and only updates rows that changed", async () => {
    await syncCatalog(client);
    const first = await syncStock(client);
    expect(first.received).toBe(seedVariants.length);
    expect(first.unknown).toBe(0);
    expect(first.updated).toBe(seedVariants.filter((v) => v.qty > 0).length);

    for (const v of seedVariants.slice(0, 20)) {
      const row = await prisma.productVariant.findUniqueOrThrow({ where: { sku: v.sku } });
      expect(row.availableQty).toBe(v.qty);
    }

    const second = await syncStock(client);
    expect(second.updated).toBe(0);
    expect(await prisma.syncLog.count({ where: { iface: "IF-02", result: "OK" } })).toBe(2);
  });

  it("deactivates products and zeroes variants that disappear from Main", async () => {
    await syncCatalog(client);
    await syncStock(client);

    const changed: Seed = structuredClone(seed);
    const removedProduct = changed.products.pop()!;
    const p001 = changed.products[0]!;
    const removedVariant = p001.variants.find((v) => v.qty > 0)!;
    p001.variants = p001.variants.filter((v) => v !== removedVariant);
    p001.variants[0]!.price = 123_000;
    p001.name = "Áo thun nam cổ tròn basic (mới)";

    const other = await startMockMain({ seed: changed });
    try {
      const otherClient = new HttpMainSystemClient({ baseUrl: other.baseUrl, timeoutMs: 3000 });
      const result = await syncCatalog(otherClient);
      expect(result.deactivated).toBe(1);
    } finally {
      await other.app.close();
    }

    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: removedProduct.id } })).isActive,
    ).toBe(false);
    expect(await prisma.product.count({ where: { isActive: true } })).toBe(39);

    const row = await prisma.productVariant.findUniqueOrThrow({
      where: { sku: removedVariant.sku },
    });
    expect(row.availableQty).toBe(0);

    const updated = await prisma.product.findUniqueOrThrow({
      where: { id: "P001" },
      include: { variants: true },
    });
    expect(updated.name).toBe("Áo thun nam cổ tròn basic (mới)");
    expect(updated.variants.find((v) => v.sku === p001.variants[0]!.sku)?.price).toBe(123_000);

    // Coming back reactivates the product.
    await syncCatalog(client);
    expect(await prisma.product.count({ where: { isActive: true } })).toBe(40);
  });

  it("logs an ERROR row and throws when Main System is unreachable", async () => {
    const down = await startMockMain();
    const deadUrl = down.baseUrl;
    await down.app.close();

    const deadClient = new HttpMainSystemClient({ baseUrl: deadUrl, timeoutMs: 1000 });
    await expect(syncCatalog(deadClient)).rejects.toBeInstanceOf(MainSystemError);
    await expect(syncStock(deadClient)).rejects.toMatchObject({ kind: "network" });

    const logs = await prisma.syncLog.findMany({ orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => [l.iface, l.result])).toEqual([
      ["IF-01", "ERROR"],
      ["IF-02", "ERROR"],
    ]);
    expect(await prisma.product.count()).toBe(0);
  });

  it("matches Vietnamese text without accents (utf8mb4_0900_ai_ci)", async () => {
    await syncCatalog(client);
    const hits = await prisma.product.findMany({ where: { name: { contains: "ao thun" } } });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((p) => p.name.toLowerCase().startsWith("áo thun"))).toBe(true);
  });
});
