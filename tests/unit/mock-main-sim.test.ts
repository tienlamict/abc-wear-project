import type { AddressInfo } from "node:net";
import Fastify from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildMockMain } from "../../mock-main/app";
import type { MainOrderPayload } from "../../mock-main/types";

const order: MainOrderPayload = {
  id: "web-order-1",
  code: "ABC-261015-ABCDE",
  createdAt: "2026-10-15T08:00:00.000Z",
  customer: { name: "Nguyễn Văn An", email: "an@example.com", phone: "0901234567" },
  shippingAddress: { line1: "1 Lê Lợi", ward: "Bến Nghé", district: "Quận 1", province: "TP.HCM" },
  shippingMethod: "STANDARD",
  shippingFee: 30_000,
  itemsTotal: 329_000,
  codAmount: 359_000,
  items: [
    {
      sku: "P000001-M-DEN",
      productName: "Áo thun nam cổ tròn basic",
      size: "M",
      color: "Đen",
      unitPrice: 329_000,
      quantity: 1,
    },
  ],
};

describe("mock-main IF-05 advance, /sim/stock, scoped fail-mode, /sim page", () => {
  // A stand-in for the website's webhook endpoint.
  const website = Fastify();
  const received: { headers: Record<string, unknown>; body: unknown }[] = [];
  let webhookUrl = "";
  let reply = 200;

  beforeAll(async () => {
    website.post("/api/integration/order-status", async (req, res) => {
      received.push({ headers: req.headers, body: req.body });
      return res.code(reply).send({ result: "changed" });
    });
    await website.listen({ port: 0, host: "127.0.0.1" });
    webhookUrl = `http://127.0.0.1:${(website.server.address() as AddressInfo).port}/api/integration/order-status`;
  });
  afterAll(() => website.close());
  beforeEach(() => {
    received.length = 0;
    reply = 200;
  });

  const newMock = async () => {
    const app = buildMockMain({ webhookUrl, webhookSecret: "s3cret" });
    const res = await app.inject({ method: "POST", url: "/main/orders", payload: order });
    return { app, mainOrderId: res.json().mainOrderId as string };
  };
  const advance = (app: ReturnType<typeof buildMockMain>, id: string, to?: string) =>
    app.inject({
      method: "POST",
      url: `/sim/orders/${id}/advance`,
      payload: to ? { to } : {},
    });

  it("walks RECEIVED → PICKING → SHIPPING → DELIVERED and pushes each status with the secret", async () => {
    const { app, mainOrderId } = await newMock();
    try {
      const picking = await advance(app, mainOrderId);
      expect(picking.json()).toMatchObject({
        status: "PICKING",
        trackingNumber: null,
        webhook: { ok: true, status: 200 },
      });
      const shipping = (await advance(app, mainOrderId)).json();
      expect(shipping.status).toBe("SHIPPING");
      expect(shipping.trackingNumber).toMatch(/^VN\d+$/);
      expect((await advance(app, mainOrderId)).json().status).toBe("DELIVERED");
      expect((await advance(app, mainOrderId)).statusCode).toBe(409); // nothing after DELIVERED

      expect(received.map((r) => (r.body as { status: string }).status)).toEqual([
        "PICKING",
        "SHIPPING",
        "DELIVERED",
      ]);
      expect(received[0]!.headers["x-main-secret"]).toBe("s3cret");
      expect(received[1]!.body).toEqual({
        mainOrderId,
        status: "SHIPPING",
        trackingNumber: shipping.trackingNumber,
      });
    } finally {
      await app.close();
    }
  });

  it("allows DELIVERY_FAILED from SHIPPING only, and re-sending the current status", async () => {
    const { app, mainOrderId } = await newMock();
    try {
      expect((await advance(app, mainOrderId, "DELIVERY_FAILED")).statusCode).toBe(409);
      await advance(app, mainOrderId);
      expect((await advance(app, mainOrderId, "DELIVERED")).statusCode).toBe(409); // no skipping
      expect((await advance(app, mainOrderId, "PICKING")).json().status).toBe("PICKING"); // re-send
      await advance(app, mainOrderId);
      expect((await advance(app, mainOrderId, "DELIVERY_FAILED")).json().status).toBe(
        "DELIVERY_FAILED",
      );
      expect((await advance(app, mainOrderId, "BOGUS")).statusCode).toBe(400);
      expect((await advance(app, "MO-999999")).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("reports a failed webhook without hiding the status change", async () => {
    reply = 500;
    const { app, mainOrderId } = await newMock();
    try {
      const res = (await advance(app, mainOrderId)).json();
      expect(res).toMatchObject({ status: "PICKING", webhook: { ok: false, status: 500 } });
    } finally {
      await app.close();
    }
  });

  it("POST /sim/stock changes what IF-02 reports", async () => {
    const app = buildMockMain();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/sim/stock",
        payload: { sku: "P000001-M-DEN", qty: 3 },
      });
      expect(res.json()).toEqual({ sku: "P000001-M-DEN", qty: 3 });
      const { items } = (await app.inject({ method: "GET", url: "/main/stock" })).json();
      expect(items.find((i: { sku: string }) => i.sku === "P000001-M-DEN").qty).toBe(3);
      expect(
        (await app.inject({ method: "POST", url: "/sim/stock", payload: { sku: "NOPE", qty: 1 } }))
          .statusCode,
      ).toBe(404);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/sim/stock",
            payload: { sku: "P000001-M-DEN", qty: -1 },
          })
        ).statusCode,
      ).toBe(400);
    } finally {
      await app.close();
    }
  });

  it("fail-mode `only` breaks one endpoint and leaves the others alone", async () => {
    const app = buildMockMain();
    try {
      await app.inject({
        method: "POST",
        url: "/sim/fail-mode",
        payload: { mode: "error", count: 1, only: "/main/orders" },
      });
      const check = await app.inject({
        method: "POST",
        url: "/main/stock-check",
        payload: { lines: [{ sku: "P000001-M-DEN", qty: 1 }] },
      });
      expect(check.statusCode).toBe(200);
      expect(
        (await app.inject({ method: "POST", url: "/main/orders", payload: order })).statusCode,
      ).toBe(503);
      expect(
        (await app.inject({ method: "POST", url: "/main/orders", payload: order })).statusCode,
      ).toBe(201);
    } finally {
      await app.close();
    }
  });

  it("serves the /sim demo page listing orders with their actions", async () => {
    const { app, mainOrderId } = await newMock();
    try {
      const res = await app.inject({ method: "GET", url: "/sim" });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/html/);
      expect(res.body).toContain(mainOrderId);
      expect(res.body).toContain(order.code);
      expect(res.body).toContain("Chuyển trạng thái");
    } finally {
      await app.close();
    }
  });
});
