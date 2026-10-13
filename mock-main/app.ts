import Fastify, { type FastifyRequest } from "fastify";
import seedData from "./seed.json";
import type { Seed, SeedProduct } from "./types";

export interface MockMainOptions {
  /** Defaults to a fresh copy of seed.json; state lives in memory only. */
  seed?: Seed;
}

const SWATCH: Record<string, string> = {
  Đen: "#1f2937",
  Trắng: "#f3f4f6",
  Xám: "#9ca3af",
  "Xanh navy": "#1e3a8a",
  Be: "#e7d8c0",
  "Đỏ đô": "#7f1d1d",
  "Xanh rêu": "#4d5d3a",
  "Hồng pastel": "#f9c6d3",
};

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function placeholderSvg(product: SeedProduct, n: number): string {
  const colors = [...new Set(product.variants.map((v) => v.color))];
  const color = colors[(n - 1) % colors.length] ?? "Xám";
  const bg = SWATCH[color] ?? "#9ca3af";
  const dark = ["#f3f4f6", "#e7d8c0", "#f9c6d3", "#9ca3af"].includes(bg);
  const fg = dark ? "#111827" : "#f9fafb";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
<rect width="600" height="800" fill="${bg}"/>
<text x="300" y="380" font-family="sans-serif" font-size="30" fill="${fg}" text-anchor="middle">${escapeXml(product.name)}</text>
<text x="300" y="430" font-family="sans-serif" font-size="22" fill="${fg}" text-anchor="middle">${escapeXml(color)} · ${n}</text>
</svg>`;
}

export function buildMockMain(options: MockMainOptions = {}) {
  const app = Fastify({ logger: { level: "warn" } });
  const state: Seed = structuredClone(options.seed ?? (seedData as Seed));
  const productsById = new Map(state.products.map((p) => [p.id, p]));

  const baseUrl = (req: FastifyRequest) => `${req.protocol}://${req.host}`;

  app.get("/healthz", async () => ({ status: "ok", service: "mock-main" }));

  // IF-01: catalog snapshot without stock levels.
  app.get("/main/catalog", async (req) => {
    const base = baseUrl(req);
    return {
      generatedAt: new Date().toISOString(),
      categories: state.categories,
      products: state.products.map((p) => ({
        id: p.id,
        categoryId: p.categoryId,
        name: p.name,
        description: p.description,
        images: p.images.map((path) => base + path),
        isActive: p.isActive,
        createdAt: p.createdAt,
        variants: p.variants.map(({ sku, size, color, price }) => ({ sku, size, color, price })),
      })),
    };
  });

  // IF-02: stock levels per SKU.
  app.get("/main/stock", async () => ({
    items: state.products.flatMap((p) => p.variants.map((v) => ({ sku: v.sku, qty: v.qty }))),
  }));

  app.get<{ Params: { file: string } }>("/images/:file", async (req, reply) => {
    const match = /^(P\d{3})-(\d)\.svg$/.exec(req.params.file);
    const product = match ? productsById.get(match[1]!) : undefined;
    if (!match || !product) return reply.code(404).send({ error: "image not found" });
    return reply
      .type("image/svg+xml")
      .header("cache-control", "public, max-age=86400")
      .send(placeholderSvg(product, Number(match[2])));
  });

  return app;
}
