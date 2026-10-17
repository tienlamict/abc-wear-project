import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { FAIL_MODES, type MockContext, NO_FAILURE } from "../context";
import { simPage } from "../sim-page";
import type { MockOrder } from "../types";

/** Main's order lifecycle after it receives an order; RECEIVED = the web's SENT_TO_MAIN. */
const NEXT_STATUS: Record<string, string | undefined> = {
  RECEIVED: "PICKING",
  PICKING: "SHIPPING",
  SHIPPING: "DELIVERED",
};
const NOTIFIABLE = ["PICKING", "SHIPPING", "DELIVERED", "DELIVERY_FAILED"] as const;

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

const catalogWebhookSchema = z.object({ enabled: z.boolean() });

/** Test and demo helpers (prefix /sim). */
export function simRoutes(ctx: MockContext) {
  return async (app: FastifyInstance) => {
    const { store } = ctx;

    const sortedOrders = () =>
      [...store.data.orders].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

    app.get("/orders", async () => ({ orders: sortedOrders() }));

    app.get("/fail-mode", async () => ctx.fail);

    app.post("/fail-mode", async (req, reply) => {
      const parsed = failModeSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'mode must be "none", "error" or "timeout"' });
      }
      const { mode, count, only } = parsed.data;
      ctx.fail =
        mode === "none" ? NO_FAILURE : { mode, remaining: count ?? null, only: only ?? null };
      app.log.warn(
        `fail-mode set to ${mode}${count ? ` for ${count} request(s)` : ""}${only ? ` on ${only}` : ""}`,
      );
      return ctx.fail;
    });

    // IF-05: move an order along and push the new status to the website.
    app.post<{ Params: { mainOrderId: string } }>(
      "/orders/:mainOrderId/advance",
      async (req, reply) => {
        const order = store.data.orders.find((o) => o.mainOrderId === req.params.mainOrderId);
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
        store.save();
        const webhook = await notifyOrderStatus(order);
        return {
          mainOrderId: order.mainOrderId,
          status: order.status,
          trackingNumber: order.trackingNumber,
          webhook,
        };
      },
    );

    async function notifyOrderStatus(order: MockOrder) {
      const { url, secret } = ctx.orderWebhook;
      if (!url) return { ok: false, error: "no webhook URL configured" };
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-main-secret": secret ?? "" },
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
    app.post("/stock", async (req, reply) => {
      const parsed = simStockSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "body must be { sku, qty >= 0 }" });
      const found = store.variant(parsed.data.sku);
      if (!found) return reply.code(404).send({ error: "unknown sku" });
      found.variant.qty = parsed.data.qty;
      store.save();
      return { sku: found.variant.sku, qty: found.variant.qty };
    });

    // Catalog back to the seed (orders and MinIO images are kept), then tell the website.
    app.post("/reset", async () => {
      store.reset();
      const sync = await ctx.notifier.notify("catalog");
      return { categories: store.categories.length, products: store.products.length, sync };
    });

    // Demo/test switch for AD-05: make the catalog-changed webhook fail as if the website were down.
    app.post("/catalog-webhook", async (req, reply) => {
      const parsed = catalogWebhookSchema.safeParse(req.body);
      if (!parsed.success)
        return reply.code(400).send({ error: "body must be { enabled: boolean }" });
      ctx.notifier.enabled = parsed.data.enabled;
      return { enabled: ctx.notifier.enabled };
    });

    // Demo page: orders received, a button to move each one along, stock and fail-mode controls.
    app.get("/", async (_req, reply) =>
      reply.type("text/html; charset=utf-8").send(simPage(sortedOrders(), ctx.fail)),
    );
  };
}
