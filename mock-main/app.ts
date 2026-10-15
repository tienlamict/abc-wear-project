import Fastify, { type FastifyRequest } from "fastify";
import { z } from "zod";
import seedData from "./seed.json";
import { simPage } from "./sim-page";
import type { MockOrder, Seed, SeedProduct, SeedVariant } from "./types";

export interface MockMainOptions {
  /** Defaults to a fresh copy of seed.json; state lives in memory only. */
  seed?: Seed;
  /** How long a request hangs in fail-mode "timeout" (default 10 s, longer than the web's 3 s). */
  hangMs?: number;
  /** IF-05: where order status changes are pushed (the website's /api/integration/order-status). */
  webhookUrl?: string;
  /** Sent as the `x-main-secret` header with every webhook call. */
  webhookSecret?: string;
  /** Base of image URLs in the catalog; default: the host the request came to. */
  imageBaseUrl?: string;
}

/** Main's order lifecycle after it receives an order; RECEIVED = the web's SENT_TO_MAIN. */
const NEXT_STATUS: Record<string, string | undefined> = {
  RECEIVED: "PICKING",
  PICKING: "SHIPPING",
  SHIPPING: "DELIVERED",
};
const NOTIFIABLE = ["PICKING", "SHIPPING", "DELIVERED", "DELIVERY_FAILED"] as const;

export const FAIL_MODES = ["none", "error", "timeout"] as const;
export type FailMode = (typeof FAIL_MODES)[number];

const stockCheckSchema = z.object({
  lines: z.array(z.object({ sku: z.string().min(1), qty: z.number().int().positive() })).min(1),
});

const orderSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  createdAt: z.string(),
  customer: z.object({ name: z.string(), email: z.string(), phone: z.string() }),
  shippingAddress: z.object({
    line1: z.string(),
    ward: z.string(),
    district: z.string(),
    province: z.string(),
  }),
  shippingMethod: z.string(),
  shippingFee: z.number().int(),
  itemsTotal: z.number().int(),
  codAmount: z.number().int(),
  items: z
    .array(
      z.object({
        sku: z.string().min(1),
        productName: z.string(),
        size: z.string(),
        color: z.string(),
        unitPrice: z.number().int(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
});

const failModeSchema = z.object({
  mode: z.enum(FAIL_MODES),
  /** Fail only the next N requests to /main/*, then go back to "none". */
  count: z.number().int().positive().optional(),
  /** Only requests whose path starts with this, e.g. "/main/orders" to break IF-04 alone. */
  only: z.string().startsWith("/main/").optional(),
});

const advanceSchema = z
  .object({
    /** Default: the next status. DELIVERY_FAILED from SHIPPING; the current status re-sends it. */
    to: z.enum(NOTIFIABLE).optional(),
  })
  .optional();

const simStockSchema = z.object({
  sku: z.string().min(1),
  qty: z.number().int().min(0),
});

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
  // forceCloseConnections: close() must not wait on keep-alive sockets left by fail-mode "timeout".
  const app = Fastify({ logger: { level: "warn" }, forceCloseConnections: true });
  const state: Seed = structuredClone(options.seed ?? (seedData as Seed));
  const productsById = new Map(state.products.map((p) => [p.id, p]));
  const variantsBySku = new Map<string, SeedVariant>(
    state.products.flatMap((p) => p.variants.map((v) => [v.sku, v] as const)),
  );
  const orders = new Map<string, MockOrder>(); // by the website's order id
  const hangMs = options.hangMs ?? 10_000;
  // Ids must stay unique across mock restarts, like a real Main System's (the web keeps old ones).
  const bootId = Date.now().toString(36).toUpperCase();
  type FailState = { mode: FailMode; remaining: number | null; only: string | null };
  const NO_FAILURE: FailState = { mode: "none", remaining: null, only: null };
  let fail: FailState = NO_FAILURE;

  const baseUrl = (req: FastifyRequest) =>
    options.imageBaseUrl?.replace(/\/+$/, "") ?? `${req.protocol}://${req.host}`;

  // Simulated outages apply to the website-facing API only (/main/*).
  app.addHook("preHandler", async (req, reply) => {
    if (!req.url.startsWith("/main/") || fail.mode === "none") return;
    if (fail.only && !req.url.startsWith(fail.only)) return;
    const mode = fail.mode;
    if (fail.remaining !== null && --fail.remaining <= 0) fail = NO_FAILURE;
    if (mode === "timeout") {
      await new Promise((resolve) => setTimeout(resolve, hangMs));
      return reply.code(504).send({ error: "simulated timeout" });
    }
    return reply.code(503).send({ error: "simulated failure" });
  });

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

  // IF-03: decisive stock check at checkout. Does not reserve anything.
  app.post("/main/stock-check", async (req, reply) => {
    const parsed = stockCheckSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid stock-check request" });
    const requested = new Map<string, number>();
    for (const { sku, qty } of parsed.data.lines) {
      requested.set(sku, (requested.get(sku) ?? 0) + qty);
    }
    const shortages = [...requested]
      .map(([sku, qty]) => ({ sku, requested: qty, available: variantsBySku.get(sku)?.qty ?? 0 }))
      .filter((s) => s.available < s.requested);
    return { ok: shortages.length === 0, shortages };
  });

  // IF-04: receive an order. Idempotent on the website's order id: a repeat returns the same
  // mainOrderId and changes nothing. A new order takes its quantities out of stock.
  app.post("/main/orders", async (req, reply) => {
    const parsed = orderSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid order payload" });
    const payload = parsed.data;

    const existing = orders.get(payload.id);
    if (existing) {
      existing.deliveries++;
      return reply.code(200).send({ mainOrderId: existing.mainOrderId, duplicate: true });
    }

    const mainOrderId = `MO-${bootId}-${String(orders.size + 1).padStart(4, "0")}`;
    orders.set(payload.id, {
      mainOrderId,
      status: "RECEIVED",
      trackingNumber: null,
      receivedAt: new Date().toISOString(),
      deliveries: 1,
      payload,
    });
    for (const item of payload.items) {
      const variant = variantsBySku.get(item.sku);
      if (variant) variant.qty = Math.max(0, variant.qty - item.quantity);
    }
    return reply.code(201).send({ mainOrderId, duplicate: false });
  });

  // --- Test and demo helpers ---

  const sortedOrders = () =>
    [...orders.values()].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  app.get("/sim/orders", async () => ({ orders: sortedOrders() }));

  app.get("/sim/fail-mode", async () => fail);

  app.post("/sim/fail-mode", async (req, reply) => {
    const parsed = failModeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'mode must be "none", "error" or "timeout"' });
    }
    const { mode, count, only } = parsed.data;
    fail = mode === "none" ? NO_FAILURE : { mode, remaining: count ?? null, only: only ?? null };
    app.log.warn(
      `fail-mode set to ${mode}${count ? ` for ${count} request(s)` : ""}${only ? ` on ${only}` : ""}`,
    );
    return fail;
  });

  // IF-05: move an order along and push the new status to the website.
  app.post<{ Params: { mainOrderId: string } }>(
    "/sim/orders/:mainOrderId/advance",
    async (req, reply) => {
      const order = [...orders.values()].find((o) => o.mainOrderId === req.params.mainOrderId);
      if (!order) return reply.code(404).send({ error: "order not found" });
      const parsed = advanceSchema.safeParse(req.body ?? undefined);
      if (!parsed.success) {
        return reply.code(400).send({ error: `"to" must be one of ${NOTIFIABLE.join(", ")}` });
      }

      const requested = parsed.data?.to;
      const next = NEXT_STATUS[order.status];
      const allowed =
        requested === undefined
          ? next !== undefined
          : requested === order.status ||
            requested === next ||
            (requested === "DELIVERY_FAILED" && order.status === "SHIPPING");
      if (!allowed) {
        return reply.code(409).send({
          error: `cannot move ${order.mainOrderId} from ${order.status} to ${requested ?? "(next)"}`,
        });
      }

      order.status = requested ?? next!;
      if (order.status === "SHIPPING" && !order.trackingNumber) {
        order.trackingNumber = `VN${Date.now().toString().slice(-8)}${order.mainOrderId.slice(-4)}`;
      }
      const webhook = await notifyWebsite(order);
      return {
        mainOrderId: order.mainOrderId,
        status: order.status,
        trackingNumber: order.trackingNumber,
        webhook,
      };
    },
  );

  async function notifyWebsite(order: MockOrder) {
    if (!options.webhookUrl) return { ok: false, error: "no webhook URL configured" };
    try {
      const res = await fetch(options.webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-main-secret": options.webhookSecret ?? "",
        },
        body: JSON.stringify({
          mainOrderId: order.mainOrderId,
          status: order.status,
          trackingNumber: order.trackingNumber ?? undefined,
        }),
        signal: AbortSignal.timeout(5000),
      });
      const body = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, body };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // Change stock in Main; the website picks it up with the next IF-02 sync (≤ 1 minute).
  app.post("/sim/stock", async (req, reply) => {
    const parsed = simStockSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "body must be { sku, qty >= 0 }" });
    const variant = variantsBySku.get(parsed.data.sku);
    if (!variant) return reply.code(404).send({ error: "unknown sku" });
    variant.qty = parsed.data.qty;
    return { sku: variant.sku, qty: variant.qty };
  });

  // Demo page: orders received, a button to move each one along, stock and fail-mode controls.
  app.get("/sim", async (_req, reply) =>
    reply.type("text/html; charset=utf-8").send(simPage(sortedOrders(), fail)),
  );

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
