import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  HttpMainSystemClient,
  type MainSystemClient,
  syncCatalog,
  syncOnCatalogChange,
} from "@/modules/integration";
import { resetCatalog, startMockMain } from "./helpers";

const AUTH = `Basic ${Buffer.from("admin:test-pw").toString("base64")}`;

/** Counts how many IF-01/IF-02 fetches run at the same time. */
function trackingClient(inner: MainSystemClient) {
  const stats = { catalog: 0, stock: 0, active: 0, maxActive: 0 };
  const track = async <T>(kind: "catalog" | "stock", run: () => Promise<T>) => {
    stats[kind]++;
    stats.active++;
    stats.maxActive = Math.max(stats.maxActive, stats.active);
    try {
      return await run();
    } finally {
      stats.active--;
    }
  };
  const client: MainSystemClient = {
    fetchCatalog: () => track("catalog", () => inner.fetchCatalog()),
    fetchStock: () => track("stock", () => inner.fetchStock()),
    checkStock: (lines) => inner.checkStock(lines),
    sendOrder: (order) => inner.sendOrder(order),
  };
  return { client, stats };
}

describe("catalog-changed: sync on request from Main (spec §9.3)", () => {
  let mock: Awaited<ReturnType<typeof startMockMain>>;
  let http: HttpMainSystemClient;

  const admin = (method: string, path: string, body?: unknown) =>
    fetch(`${mock.baseUrl}/admin/api${path}`, {
      method,
      headers: { authorization: AUTH, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  beforeAll(async () => {
    mock = await startMockMain({ admin: { user: "admin", password: "test-pw" } });
    http = new HttpMainSystemClient({ baseUrl: mock.baseUrl, timeoutMs: 3000 });
  });
  afterAll(async () => {
    await mock.app.close();
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await resetCatalog();
    await syncCatalog(http);
  });

  it('"catalog" brings a product created in /admin, with its images and stock', async () => {
    const res = await admin("POST", "/products", {
      name: "Áo khoác gió unisex",
      categoryId: "CAT-NAM-AO-THUN",
      variants: [{ size: "M", color: "Đen", price: 399000, qty: 12 }],
    });
    const { product } = await res.json();
    mock.app.mock.store.product(product.id)!.images = [`products/${product.id}/abc.webp`];

    const result = await syncOnCatalogChange("catalog", http);
    expect(result).toMatchObject({ synced: "catalog", products: 41 });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    const row = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      include: { variants: true },
    });
    expect(row.images).toEqual([
      `http://localhost:9000/product-images/products/${product.id}/abc.webp`,
    ]);
    expect(row.variants).toEqual([
      expect.objectContaining({ sku: `${product.id}-M-DEN`, price: 399000, availableQty: 12 }),
    ]);

    const log = await prisma.syncLog.findFirst({
      where: { recordKey: "catalog-changed" },
      orderBy: { createdAt: "desc" },
    });
    expect(log).toMatchObject({ direction: "IN", iface: "IF-01", result: "OK" });
  });

  it('"stock" only copies stock levels; a stopped product becomes inactive with "catalog"', async () => {
    await admin("PATCH", "/variants/P000001-M-DEN", { qty: 0 });
    await admin("PATCH", "/variants/P000002-M-DO", { price: 1000 }); // not applied by "stock"
    const { client, stats } = trackingClient(http);
    const result = await syncOnCatalogChange("stock", client);
    expect(result.synced).toBe("stock");
    expect(stats).toMatchObject({ catalog: 0, stock: 1 });
    expect(
      (await prisma.productVariant.findUniqueOrThrow({ where: { sku: "P000001-M-DEN" } }))
        .availableQty,
    ).toBe(0);
    expect(
      (await prisma.productVariant.findUniqueOrThrow({ where: { sku: "P000002-M-DO" } })).price,
    ).not.toBe(1000);

    await admin("PUT", "/products/P000003", { isActive: false });
    await syncOnCatalogChange("catalog", http);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: "P000003" } })).isActive).toBe(
      false,
    );
  });

  it("never runs two syncs at once; requests that wait share one follow-up run", async () => {
    const { client, stats } = trackingClient(http);
    const first = syncOnCatalogChange("stock", client);
    await vi.waitFor(() => expect(stats.active).toBe(1), { interval: 1 }); // first one is running
    const results = await Promise.all([
      first,
      syncOnCatalogChange("stock", client),
      syncOnCatalogChange("catalog", client),
      syncOnCatalogChange("stock", client),
    ]);
    expect(stats.maxActive).toBe(1);
    // First request runs alone; the three that waited share one run, upgraded to "catalog".
    expect(results.map((r) => r.synced)).toEqual(["stock", "catalog", "catalog", "catalog"]);
    expect(stats).toMatchObject({ catalog: 1, stock: 2 });
  });

  it("a failed sync is a SYNC_FAILED error and is logged; the next request runs normally", async () => {
    await fetch(`${mock.baseUrl}/sim/fail-mode`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "error", count: 1 }),
    });
    await expect(syncOnCatalogChange("catalog", http)).rejects.toMatchObject({
      code: "SYNC_FAILED",
      status: 502,
    });
    const log = await prisma.syncLog.findFirst({
      where: { recordKey: "catalog-changed" },
      orderBy: { createdAt: "desc" },
    });
    expect(log).toMatchObject({ iface: "IF-01", result: "ERROR" });

    await expect(syncOnCatalogChange("catalog", http)).resolves.toMatchObject({
      synced: "catalog",
    });
  });
});
