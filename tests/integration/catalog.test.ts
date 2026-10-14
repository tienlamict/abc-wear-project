import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  PAGE_SIZE,
  compareSizes,
  getCategoryTree,
  getProduct,
  listProducts,
  parseProductFilters,
} from "@/modules/catalog";
import { HttpMainSystemClient, syncCatalog, syncStock } from "@/modules/integration";
import seedJson from "../../mock-main/seed.json";
import type { Seed } from "../../mock-main/types";
import { resetCatalog, startMockMain } from "./helpers";

const seed = seedJson as Seed;
const filters = (query: Record<string, string | string[]>) => parseProductFilters(query);

describe("catalog queries (PS-01 → PS-04) on synced seed data", () => {
  beforeAll(async () => {
    await resetCatalog();
    const mock = await startMockMain();
    try {
      const client = new HttpMainSystemClient({ baseUrl: mock.baseUrl, timeoutMs: 3000 });
      await syncCatalog(client);
      await syncStock(client);
    } finally {
      await mock.app.close();
    }
  });
  afterAll(() => prisma.$disconnect());

  it("PS-03 returns the two-level category tree", async () => {
    const tree = await getCategoryTree();
    expect(tree.map((c) => c.slug)).toEqual(["nam", "nu"]);
    expect(tree[0]!.children.map((c) => c.slug)).toEqual(["ao-thun-nam", "quan-nam"]);
  });

  it("PS-03 a parent category includes products of its children", async () => {
    const childIds = seed.categories.filter((c) => c.parentId === "CAT-NAM").map((c) => c.id);
    const expected = seed.products.filter((p) => childIds.includes(p.categoryId)).length;

    const result = await listProducts(filters({ category: "nam" }));
    expect(result.total).toBe(expected);
    const child = await listProducts(filters({ category: "quan-nam" }));
    expect(child.total).toBe(seed.products.filter((p) => p.categoryId === "CAT-NAM-QUAN").length);
    expect(child.total).toBeLessThan(result.total);
  });

  it("rejects an unknown category", async () => {
    await expect(listProducts(filters({ category: "khong-co" }))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("PS-01 matches keywords without Vietnamese accents, in name or description", async () => {
    const result = await listProducts(filters({ q: "ao thun" }));
    expect(result.total).toBeGreaterThan(0);
    expect(result.items.every((p) => p.name.toLowerCase().includes("áo thun"))).toBe(true);

    const dam = await listProducts(filters({ q: "DAM" }));
    expect(dam.items.some((p) => p.name.startsWith("Đầm"))).toBe(true);

    const byDescription = await listProducts(filters({ q: "cotton 100%" }));
    expect(byDescription.total).toBeGreaterThan(0);
  });

  it("treats LIKE wildcards in the keyword literally", async () => {
    // "100%" appears in descriptions; an unescaped "_" would match its "%".
    expect((await listProducts(filters({ q: "100%" }))).total).toBeGreaterThan(0);
    expect((await listProducts(filters({ q: "100_" }))).total).toBe(0);
    expect((await listProducts(filters({ q: "_" }))).total).toBe(0);
  });

  it("PS-02 keeps only products with one variant matching size and price range together", async () => {
    const [minPrice, maxPrice] = [200_000, 350_000];
    const expected = seed.products.filter((p) =>
      p.variants.some((v) => v.size === "M" && v.price >= minPrice && v.price <= maxPrice),
    );

    const result = await listProducts(
      filters({ size: "M", minPrice: String(minPrice), maxPrice: String(maxPrice) }),
    );
    expect(result.total).toBe(expected.length);
    expect(result.items.map((p) => p.id).sort()).toEqual(expected.map((p) => p.id).sort());
    for (const item of result.items) {
      expect(item.minPrice).toBeGreaterThanOrEqual(minPrice);
      expect(item.maxPrice).toBeLessThanOrEqual(maxPrice);
    }
  });

  it("PS-02 filters by color and returns facets for the whole keyword/category scope", async () => {
    const result = await listProducts(filters({ category: "nu", color: "Đen" }));
    expect(result.total).toBeGreaterThan(0);
    for (const item of result.items) expect(item.colors).toContain("Đen");
    // Facets ignore the color filter itself, so other colors stay selectable.
    const nuSizes = new Set(
      seed.products
        .filter((p) => p.categoryId.startsWith("CAT-NU-"))
        .flatMap((p) => p.variants.map((v) => v.size)),
    );
    expect(result.facets.sizes).toEqual([...nuSizes].sort(compareSizes));
    expect(result.facets.colors.length).toBeGreaterThan(1);
  });

  it("PS-02 sorts by price both ways and by newest", async () => {
    const asc = (await listProducts(filters({ sort: "price_asc" }))).items.map((p) => p.minPrice);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    const desc = (await listProducts(filters({ sort: "price_desc" }))).items.map((p) => p.minPrice);
    expect(desc).toEqual([...desc].sort((a, b) => b - a));

    const newest = (await listProducts(filters({}))).items[0]!;
    const latestSeed = [...seed.products].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )[0]!;
    expect(newest.id).toBe(latestSeed.id);
  });

  it("paginates 24 per page", async () => {
    const page1 = await listProducts(filters({}));
    const page2 = await listProducts(filters({ page: "2" }));
    expect(page1.pageSize).toBe(PAGE_SIZE);
    expect(page1.total).toBe(40);
    expect(page1.totalPages).toBe(2);
    expect(page1.items).toHaveLength(24);
    expect(page2.items).toHaveLength(16);
    const ids = new Set([...page1.items, ...page2.items].map((p) => p.id));
    expect(ids.size).toBe(40);
  });

  it("PS-04 returns variants with stock and the QT6 purchasable flag", async () => {
    const seedP001 = seed.products.find((p) => p.id === "P001")!;
    const p001 = (await getProduct("P001"))!;
    expect(p001.category).toEqual({
      name: "Áo thun nam",
      slug: "ao-thun-nam",
      parent: { name: "Nam", slug: "nam" },
    });
    expect(p001.variants).toHaveLength(seedP001.variants.length);
    for (const v of seedP001.variants) {
      const row = p001.variants.find((x) => x.sku === v.sku)!;
      expect(row).toMatchObject({ availableQty: v.qty, purchasable: v.qty > 0 });
    }
    expect(p001.purchasable).toBe(true);

    // P007 has no stock at all.
    const p007 = (await getProduct("P007"))!;
    expect(p007.purchasable).toBe(false);
    expect(await getProduct("NOPE")).toBeNull();
  });

  it("QT6 hides inactive products from listings and makes them unpurchasable", async () => {
    await prisma.product.update({ where: { id: "P001" }, data: { isActive: false } });
    try {
      const result = await listProducts(filters({ q: "cổ tròn basic" }));
      expect(result.items.map((p) => p.id)).not.toContain("P001");
      const p001 = (await getProduct("P001"))!;
      expect(p001.isActive).toBe(false);
      expect(p001.purchasable).toBe(false);
      expect(p001.variants.every((v) => !v.purchasable)).toBe(true);
    } finally {
      await prisma.product.update({ where: { id: "P001" }, data: { isActive: true } });
    }
  });
});
