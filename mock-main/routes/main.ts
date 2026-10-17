import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { type MockContext, NO_FAILURE } from "../context";

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

/** The website-facing API, IF-01 → IF-04 (prefix /main). */
export function mainRoutes(ctx: MockContext) {
  return async (app: FastifyInstance) => {
    const { store } = ctx;

    // Simulated outages apply to this API only.
    app.addHook("preHandler", async (req, reply) => {
      const { fail } = ctx;
      if (fail.mode === "none") return;
      if (fail.only && !req.url.startsWith(fail.only)) return;
      const mode = fail.mode;
      if (fail.remaining !== null && --fail.remaining <= 0) ctx.fail = NO_FAILURE;
      if (mode === "timeout") {
        await new Promise((resolve) => setTimeout(resolve, ctx.hangMs));
        return reply.code(504).send({ error: "simulated timeout" });
      }
      return reply.code(503).send({ error: "simulated failure" });
    });

    // IF-01: catalog snapshot without stock levels; images as public URLs in display order.
    app.get("/catalog", async () => ({
      generatedAt: new Date().toISOString(),
      categories: store.categories,
      products: store.products.map((p) => ({
        id: p.id,
        categoryId: p.categoryId,
        name: p.name,
        description: p.description,
        images: p.images.map((key) => ctx.imageUrl(key)),
        isActive: p.isActive,
        createdAt: p.createdAt,
        variants: p.variants.map(({ sku, size, color, price }) => ({ sku, size, color, price })),
      })),
    }));

    // IF-02: stock levels per SKU.
    app.get("/stock", async () => ({
      items: store.products.flatMap((p) => p.variants.map((v) => ({ sku: v.sku, qty: v.qty }))),
    }));

    // IF-03: decisive stock check at checkout. Does not reserve anything.
    app.post("/stock-check", async (req, reply) => {
      const parsed = stockCheckSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid stock-check request" });
      const requested = new Map<string, number>();
      for (const { sku, qty } of parsed.data.lines) {
        requested.set(sku, (requested.get(sku) ?? 0) + qty);
      }
      const shortages = [...requested]
        .map(([sku, qty]) => ({
          sku,
          requested: qty,
          available: store.variant(sku)?.variant.qty ?? 0,
        }))
        .filter((s) => s.available < s.requested);
      return { ok: shortages.length === 0, shortages };
    });

    // IF-04: receive an order. Idempotent on the website's order id: a repeat returns the same
    // mainOrderId and changes nothing. A new order takes its quantities out of stock.
    app.post("/orders", async (req, reply) => {
      const parsed = orderSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid order payload" });
      const payload = parsed.data;

      const existing = store.order(payload.id);
      if (existing) {
        existing.deliveries++;
        store.save();
        return reply.code(200).send({ mainOrderId: existing.mainOrderId, duplicate: true });
      }

      const seq = store.data.orders.filter((o) => o.mainOrderId.includes(ctx.bootId)).length + 1;
      const mainOrderId = `MO-${ctx.bootId}-${String(seq).padStart(4, "0")}`;
      store.data.orders.push({
        mainOrderId,
        status: "RECEIVED",
        trackingNumber: null,
        receivedAt: new Date().toISOString(),
        deliveries: 1,
        payload,
      });
      for (const item of payload.items) {
        const found = store.variant(item.sku);
        if (found) found.variant.qty = Math.max(0, found.variant.qty - item.quantity);
      }
      store.save();
      return reply.code(201).send({ mainOrderId, duplicate: false });
    });
  };
}
