import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type MockMainApp, buildMockMain } from "../../mock-main/app";
import type { ImageStorage } from "../../mock-main/minio";
import { Store } from "../../mock-main/store";

const AUTH = { authorization: `Basic ${Buffer.from("admin:secret-pw").toString("base64")}` };
const fixture = (name: string) => readFileSync(join(__dirname, "../fixtures", name));

/** Stand-in for MinIO: objects in a Map. */
class MemoryStorage implements ImageStorage {
  objects = new Map<string, Buffer>();
  async put(key: string, data: Buffer) {
    this.objects.set(key, data);
  }
  async remove(key: string) {
    this.objects.delete(key);
  }
  async exists(key: string) {
    return this.objects.has(key);
  }
  async isEmpty() {
    return this.objects.size === 0;
  }
}

/** A fake website that records catalog-changed calls. */
async function fakeWebsite() {
  const calls: { type: string; secret: unknown }[] = [];
  const web = Fastify();
  web.post("/api/integration/catalog-changed", async (req) => {
    const { type } = req.body as { type: string };
    calls.push({ type, secret: req.headers["x-main-secret"] });
    return { synced: type, products: 41, variants: 200, durationMs: 5 };
  });
  await web.listen({ port: 0, host: "127.0.0.1" });
  const { port } = web.server.address() as AddressInfo;
  return { web, calls, url: `http://127.0.0.1:${port}/api/integration/catalog-changed` };
}

function multipart(files: { name: string; data: Buffer; type?: string }[]) {
  const form = new FormData();
  for (const f of files) {
    form.append(
      "files",
      new Blob([new Uint8Array(f.data)], { type: f.type ?? "image/jpeg" }),
      f.name,
    );
  }
  return form;
}

const newProduct = {
  name: "Áo khoác gió unisex",
  description: "Chống nước nhẹ",
  categoryId: "CAT-NAM-AO-THUN",
  variants: [
    { size: "M", color: "Đen", price: 399000, qty: 10 },
    { size: "L", color: "Xanh lá", price: 419000, qty: 0 },
  ],
};

describe("mock Main System /admin (AD-01 → AD-05)", () => {
  let site: Awaited<ReturnType<typeof fakeWebsite>>;
  let storage: MemoryStorage;
  let app: MockMainApp;

  beforeAll(async () => {
    site = await fakeWebsite();
  });
  afterAll(() => site.web.close());

  beforeEach(() => {
    site.calls.length = 0;
    storage = new MemoryStorage();
    app = buildMockMain({
      storage,
      catalogWebhookUrl: site.url,
      webhookSecret: "hook-secret",
      admin: { user: "admin", password: "secret-pw" },
    });
  });
  afterEach(() => app.close());

  const api = (
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    payload?: unknown,
  ) => app.inject({ method, url: `/admin/api${url}`, headers: AUTH, payload: payload as never });

  const create = async (body: unknown = newProduct) => {
    const res = await api("POST", "/products", body);
    expect(res.statusCode, res.body).toBe(201);
    return res.json().product as { id: string; variants: { sku: string }[] };
  };

  describe("AD-01 basic auth and list", () => {
    it("blocks pages and API without the right credentials", async () => {
      for (const url of [
        "/admin",
        "/admin/products/P000001",
        "/admin/api/products",
        "/admin/admin.js",
      ]) {
        const res = await app.inject({ method: "GET", url });
        expect(res.statusCode, url).toBe(401);
        expect(res.headers["www-authenticate"]).toMatch(/^Basic/);
      }
      const wrong = await app.inject({
        method: "GET",
        url: "/admin/api/products",
        headers: { authorization: `Basic ${Buffer.from("admin:nope").toString("base64")}` },
      });
      expect(wrong.statusCode).toBe(401);
      expect(wrong.json().error.code).toBe("UNAUTHORIZED");
    });

    it("serves the admin pages with credentials", async () => {
      const list = await app.inject({ method: "GET", url: "/admin", headers: AUTH });
      expect(list.statusCode).toBe(200);
      expect(list.headers["content-type"]).toMatch(/text\/html/);
      expect(list.body).toContain("Đồng bộ ngay");
      const form = await app.inject({ method: "GET", url: "/admin/products/new", headers: AUTH });
      expect(form.body).toContain("Lưu sản phẩm");
      const js = await app.inject({ method: "GET", url: "/admin/admin.js", headers: AUTH });
      expect(js.statusCode).toBe(200);
    });

    it("searches accent-insensitively and filters by category and status", async () => {
      const all = (await api("GET", "/products")).json();
      expect(all.total).toBe(40);
      expect(all.items[0]).toMatchObject({ id: "P000040", imageCount: 2, isActive: true });

      const search = (await api("GET", "/products?q=ao%20thun%20nam")).json();
      expect(search.total).toBeGreaterThan(0);
      expect(search.items.every((p: { name: string }) => /áo thun nam/i.test(p.name))).toBe(true);
      expect((await api("GET", "/products?q=P000007")).json().items[0].id).toBe("P000007");

      const women = (await api("GET", "/products?category=CAT-NU")).json();
      expect(women.total).toBe(20); // parent includes its children
      expect((await api("GET", "/products?category=CAT-NU-VAY")).json().total).toBe(10);

      await api("PUT", "/products/P000003", { isActive: false });
      const inactive = (await api("GET", "/products?status=inactive")).json();
      expect(inactive.items.map((p: { id: string }) => p.id)).toEqual(["P000003"]);
      expect((await api("GET", "/products?status=active")).json().total).toBe(39);
    });
  });

  describe("AD-02 products and variants", () => {
    it("creates a product with the next id and suggested SKUs, then notifies the website", async () => {
      const res = await api("POST", "/products", newProduct);
      expect(res.statusCode).toBe(201);
      const { product, sync } = res.json();
      expect(product.id).toBe("P000041");
      expect(product.variants.map((v: { sku: string }) => v.sku)).toEqual([
        "P000041-M-DEN",
        "P000041-L-XANHLA",
      ]);
      expect(product.images).toEqual([]);
      expect(sync).toMatchObject({ ok: true, type: "catalog" });
      expect(site.calls).toEqual([{ type: "catalog", secret: "hook-secret" }]);

      const catalog = (await app.inject({ method: "GET", url: "/main/catalog" })).json();
      expect(catalog.products.find((p: { id: string }) => p.id === "P000041")).toMatchObject({
        name: newProduct.name,
        categoryId: "CAT-NAM-AO-THUN",
        isActive: true,
      });
      const stock = (await app.inject({ method: "GET", url: "/main/stock" })).json();
      expect(stock.items).toContainEqual({ sku: "P000041-M-DEN", qty: 10 });
    });

    it("rejects a SKU used anywhere in the catalog, and saves nothing", async () => {
      const res = await api("POST", "/products", {
        ...newProduct,
        variants: [{ sku: "p000001-m-hong", size: "M", color: "Hồng", price: 100000, qty: 1 }],
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toMatchObject({ code: "SKU_TAKEN" });
      expect(res.json().error.message).toContain("P000001-M-HONG");
      expect((await api("GET", "/products")).json().total).toBe(40);
      expect(site.calls).toHaveLength(0);
    });

    it("validates required fields, prices and leaf categories with Vietnamese messages", async () => {
      const noVariants = await api("POST", "/products", { ...newProduct, variants: [] });
      expect(noVariants.statusCode).toBe(400);
      expect(noVariants.json().error.message).toBe("Cần ít nhất 1 biến thể.");

      const badPrice = await api("POST", "/products", {
        ...newProduct,
        variants: [{ size: "M", color: "Đen", price: 0, qty: 1 }],
      });
      expect(badPrice.json().error.message).toBe(
        "Biến thể dòng 1: Giá phải là số nguyên VND lớn hơn 0.",
      );

      const noName = await api("POST", "/products", { ...newProduct, name: "  " });
      expect(noName.json().error.message).toBe("Nhập tên sản phẩm.");

      const parent = await api("POST", "/products", { ...newProduct, categoryId: "CAT-NAM" });
      expect(parent.statusCode).toBe(400);
      expect(parent.json().error.message).toMatch(/danh mục con/);

      const duplicate = await api("POST", "/products", {
        ...newProduct,
        variants: [
          { size: "M", color: "Đen", price: 1000, qty: 1 },
          { size: "m", color: "đen", price: 1000, qty: 1 },
        ],
      });
      expect(duplicate.statusCode).toBe(409);
    });

    it("edits info, updates existing variants and adds new ones; size/color stay fixed", async () => {
      const { id } = await create();
      const res = await api("PUT", `/products/${id}`, {
        name: "Áo khoác gió 2 lớp",
        variants: [
          { sku: `${id}-M-DEN`, price: 449000, qty: 3 },
          { size: "XL", color: "Đen", price: 459000, qty: 5 },
        ],
      });
      expect(res.statusCode, res.body).toBe(200);
      const { product } = res.json();
      expect(product.name).toBe("Áo khoác gió 2 lớp");
      expect(product.variants).toEqual([
        { sku: `${id}-M-DEN`, size: "M", color: "Đen", price: 449000, qty: 3 },
        { sku: `${id}-L-XANHLA`, size: "L", color: "Xanh lá", price: 419000, qty: 0 },
        { sku: `${id}-XL-DEN`, size: "XL", color: "Đen", price: 459000, qty: 5 },
      ]);

      const resize = await api("PUT", `/products/${id}`, {
        variants: [{ sku: `${id}-M-DEN`, size: "S", price: 449000, qty: 3 }],
      });
      expect(resize.statusCode).toBe(400);
      expect(resize.json().error.message).toMatch(/không đổi size\/màu/);
    });
  });

  describe("AD-04 quick edits", () => {
    it("a stock-only change asks for a stock sync; a price change for a catalog sync", async () => {
      const stock = await api("PATCH", "/variants/P000001-M-DEN", { qty: 0 });
      expect(stock.statusCode).toBe(200);
      expect(stock.json()).toMatchObject({
        productId: "P000001",
        variant: { qty: 0 },
        sync: { type: "stock" },
      });

      const price = await api("PATCH", "/variants/P000001-M-DEN", { price: 299000 });
      expect(price.json().sync.type).toBe("catalog");
      expect(site.calls.map((c) => c.type)).toEqual(["stock", "catalog"]);

      expect((await api("PATCH", "/variants/NOPE", { qty: 1 })).statusCode).toBe(404);
      expect((await api("PATCH", "/variants/P000001-M-DEN", {})).statusCode).toBe(400);
      expect((await api("PATCH", "/variants/P000001-M-DEN", { qty: -1 })).statusCode).toBe(400);
    });

    it("stopping a product keeps its images and shows isActive=false to the website", async () => {
      const res = await api("PUT", "/products/P000005", { isActive: false });
      expect(res.json().product).toMatchObject({ isActive: false });
      expect(res.json().product.images).toHaveLength(2);
      const catalog = (await app.inject({ method: "GET", url: "/main/catalog" })).json();
      expect(catalog.products.find((p: { id: string }) => p.id === "P000005").isActive).toBe(false);
    });
  });

  describe("AD-03 images", () => {
    const upload = (id: string, files: Parameters<typeof multipart>[0]) =>
      app.inject({
        method: "POST",
        url: `/admin/api/products/${id}/images`,
        headers: AUTH,
        payload: multipart(files),
      });

    it("stores JPEG and PNG as WebP ≤ 1200 px under server-made keys, and rejects a fake image", async () => {
      const { id } = await create();
      const res = await upload(id, [
        { name: "sample.jpg", data: fixture("sample.jpg") },
        { name: "../../evil name.png", data: fixture("sample.png"), type: "image/png" },
        { name: "fake-image.jpg", data: fixture("fake-image.jpg") },
      ]);
      expect(res.statusCode, res.body).toBe(200);
      const body = res.json();
      expect(body.results.map((r: { ok: boolean }) => r.ok)).toEqual([true, true, false]);
      expect(body.results[0]).toMatchObject({ width: 900, height: 1200 }); // EXIF-rotated, scaled
      expect(body.results[2].error).toMatch(/JPEG, PNG hoặc WebP/);
      expect(body.images).toHaveLength(2);
      expect(body.sync).toMatchObject({ ok: true, type: "catalog" });

      const keys = [...storage.objects.keys()];
      expect(keys).toHaveLength(2);
      for (const key of keys) {
        expect(key).toMatch(new RegExp(`^products/${id}/[0-9a-f-]{36}\\.webp$`));
        const meta = await sharp(storage.objects.get(key)!).metadata();
        expect(meta.format).toBe("webp");
        expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(1200);
      }
      expect(body.images[0].url).toBe(
        `http://localhost:9000/product-images/products/${id}/${body.images[0].id}.webp`,
      );
    });

    it("rejects files over 5 MB and images that are too small", async () => {
      const { id } = await create();
      // Random pixels do not compress: a real 1500×1500 PNG of ~6.7 MB.
      const big = await sharp(randomBytes(1500 * 1500 * 3), {
        raw: { width: 1500, height: 1500, channels: 3 },
      })
        .png({ compressionLevel: 0 })
        .toBuffer();
      expect(big.length).toBeGreaterThan(5 * 1024 * 1024);
      const tiny = await sharp({
        create: { width: 300, height: 600, channels: 3, background: "#fff" },
      })
        .png()
        .toBuffer();

      const res = await upload(id, [
        { name: "big.png", data: big, type: "image/png" },
        { name: "tiny.png", data: tiny, type: "image/png" },
      ]);
      const [bigResult, tinyResult] = res.json().results;
      expect(bigResult).toMatchObject({ ok: false, error: "File vượt quá 5 MB." });
      expect(tinyResult.ok).toBe(false);
      expect(tinyResult.error).toMatch(/quá nhỏ \(300×600\)/);
      expect(storage.objects.size).toBe(0);
      expect(res.json().sync).toBeNull();
    });

    it("allows at most 8 images per product", async () => {
      const { id } = await create();
      const png = { name: "a.png", data: fixture("sample.png"), type: "image/png" };
      const res = await upload(
        id,
        Array.from({ length: 9 }, () => png),
      );
      const results = res.json().results;
      expect(results.filter((r: { ok: boolean }) => r.ok)).toHaveLength(8);
      expect(results[8]).toMatchObject({ ok: false });
      expect(results[8].error).toMatch(/tối đa 8 ảnh/);
      const again = await upload(id, [png]);
      expect(again.json().results[0].ok).toBe(false);
    });

    it("deletes from storage first, reorders, and refuses an order that does not match", async () => {
      const { id } = await create();
      const res = await upload(id, [
        { name: "1.jpg", data: fixture("sample.jpg") },
        { name: "2.png", data: fixture("sample.png"), type: "image/png" },
      ]);
      const [first, second] = res.json().images as { id: string }[];

      const reordered = await api("PUT", `/products/${id}/images/order`, {
        imageIds: [second!.id, first!.id],
      });
      expect(reordered.json().images.map((i: { id: string }) => i.id)).toEqual([
        second!.id,
        first!.id,
      ]);
      const catalog = (await app.inject({ method: "GET", url: "/main/catalog" })).json();
      const images = catalog.products.find((p: { id: string }) => p.id === id).images;
      expect(images[0]).toContain(second!.id);

      const bad = await api("PUT", `/products/${id}/images/order`, { imageIds: [first!.id] });
      expect(bad.statusCode).toBe(400);

      const del = await api("DELETE", `/products/${id}/images/${first!.id}`);
      expect(del.json().images.map((i: { id: string }) => i.id)).toEqual([second!.id]);
      expect([...storage.objects.keys()]).toEqual([`products/${id}/${second!.id}.webp`]);
      expect((await api("DELETE", `/products/${id}/images/${first!.id}`)).statusCode).toBe(404);
    });

    it("answers 503 when MinIO is not configured", async () => {
      const bare = buildMockMain({ admin: { user: "admin", password: "secret-pw" } });
      try {
        const res = await bare.inject({
          method: "POST",
          url: "/admin/api/products/P000001/images",
          headers: AUTH,
          payload: multipart([{ name: "a.jpg", data: fixture("sample.jpg") }]),
        });
        expect(res.statusCode).toBe(503);
        expect(res.json().error.code).toBe("STORAGE_UNAVAILABLE");
      } finally {
        await bare.close();
      }
    });
  });

  describe("AD-05 sync with the website", () => {
    it("'Đồng bộ ngay' calls the webhook and remembers the last result", async () => {
      expect((await api("GET", "/sync/last")).json()).toEqual({ last: null });
      const res = await api("POST", "/sync", { type: "catalog" });
      expect(res.json()).toMatchObject({ ok: true, type: "catalog" });
      expect(res.json().message).toMatch(/Đã đồng bộ sang website: 41 sản phẩm/);
      expect((await api("GET", "/sync/last")).json().last).toMatchObject({ ok: true });
    });

    it("a failed webhook does not undo the change and is reported", async () => {
      await app.inject({
        method: "POST",
        url: "/sim/catalog-webhook",
        payload: { enabled: false },
      });
      const res = await api("PATCH", "/variants/P000002-M-DO", { price: 250000 });
      expect(res.statusCode).toBe(200);
      expect(res.json().sync.ok).toBe(false);
      expect(res.json().sync.message).toMatch(/^Chưa đồng bộ được sang website/);
      expect(site.calls).toHaveLength(0);
      const catalog = (await app.inject({ method: "GET", url: "/main/catalog" })).json();
      const variant = catalog.products
        .flatMap((p: { variants: { sku: string; price: number }[] }) => p.variants)
        .find((v: { sku: string }) => v.sku === "P000002-M-DO");
      expect(variant.price).toBe(250000);
    });

    it("reports an unreachable website", async () => {
      const offline = buildMockMain({
        catalogWebhookUrl: "http://127.0.0.1:9/api/integration/catalog-changed",
        admin: { user: "admin", password: "secret-pw" },
      });
      try {
        const res = await offline.inject({
          method: "POST",
          url: "/admin/api/sync",
          headers: AUTH,
          payload: { type: "stock" },
        });
        expect(res.json()).toMatchObject({ ok: false, type: "stock" });
        expect(res.json().message).toMatch(/website không truy cập được/);
      } finally {
        await offline.close();
      }
    });
  });
});

describe("mock Main System store", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mock-main-store-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("keeps data across restarts and resets the catalog to the seed", async () => {
    const file = join(dir, "store.json");
    const first = buildMockMain({
      storeFile: file,
      admin: { user: "admin", password: "secret-pw" },
    });
    const res = await first.inject({
      method: "POST",
      url: "/admin/api/products",
      headers: AUTH,
      payload: newProduct,
    });
    expect(res.statusCode).toBe(201);
    await first.inject({
      method: "POST",
      url: "/sim/stock",
      payload: { sku: "P000001-M-DEN", qty: 7 },
    });
    await first.close();

    const restarted = new Store({ file });
    expect(restarted.product("P000041")?.name).toBe(newProduct.name);
    expect(restarted.variant("P000001-M-DEN")?.variant.qty).toBe(7);

    restarted.reset();
    const again = new Store({ file });
    expect(again.products).toHaveLength(40);
    expect(again.variant("P000001-M-DEN")?.variant.qty).not.toBe(7);
  });
});
