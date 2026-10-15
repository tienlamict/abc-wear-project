import { afterAll, describe, expect, it } from "vitest";
import { buildMockMain } from "../../mock-main/app";
import seed from "../../mock-main/seed.json";

describe("mock-main", () => {
  const app = buildMockMain();
  afterAll(() => app.close());

  it("responds on /healthz", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", service: "mock-main" });
  });

  it("seed matches the spec: 6 categories on 2 levels, 40 products, 3–4 sizes × 1–2 colors", () => {
    expect(seed.categories).toHaveLength(6);
    const roots = seed.categories.filter((c) => c.parentId === null).map((c) => c.id);
    for (const c of seed.categories) {
      if (c.parentId !== null) expect(roots).toContain(c.parentId);
    }
    expect(seed.products).toHaveLength(40);
    for (const p of seed.products) {
      const sizes = new Set(p.variants.map((v) => v.size));
      const colors = new Set(p.variants.map((v) => v.color));
      expect(sizes.size).toBeGreaterThanOrEqual(3);
      expect(sizes.size).toBeLessThanOrEqual(4);
      expect(colors.size).toBeGreaterThanOrEqual(1);
      expect(colors.size).toBeLessThanOrEqual(2);
      expect(roots).not.toContain(p.categoryId);
    }
    const variants = seed.products.flatMap((p) => p.variants);
    expect(variants.some((v) => v.qty === 0)).toBe(true);
    expect(new Set(variants.map((v) => v.sku)).size).toBe(variants.length);
  });

  it("serves the catalog without stock and with absolute image URLs", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/main/catalog",
      headers: { host: "main.test:4100" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.categories).toHaveLength(6);
    expect(body.products).toHaveLength(40);
    expect(body.products[0].images[0]).toBe("http://main.test:4100/images/P001-1.svg");
    expect(body.products[0].variants[0]).not.toHaveProperty("qty");
  });

  it("serves stock for every SKU", async () => {
    const res = await app.inject({ method: "GET", url: "/main/stock" });
    const { items } = res.json();
    expect(items).toHaveLength(seed.products.flatMap((p) => p.variants).length);
    expect(items[0]).toEqual({ sku: expect.any(String), qty: expect.any(Number) });
  });

  it("serves placeholder images", async () => {
    const ok = await app.inject({ method: "GET", url: "/images/P001-1.svg" });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["content-type"]).toMatch(/image\/svg\+xml/);
    const missing = await app.inject({ method: "GET", url: "/images/P999-1.svg" });
    expect(missing.statusCode).toBe(404);
  });
});

describe("mock-main imageBaseUrl", () => {
  it("builds image URLs from the configured base instead of the request host", async () => {
    const app = buildMockMain({ imageBaseUrl: "http://localhost:4100/" });
    try {
      const res = await app.inject({
        method: "GET",
        url: "/main/catalog",
        headers: { host: "127.0.0.1:5555" },
      });
      expect(res.json().products[0].images[0]).toBe("http://localhost:4100/images/P001-1.svg");
    } finally {
      await app.close();
    }
  });
});
