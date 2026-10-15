import { afterEach, describe, expect, it } from "vitest";
import { buildMockMain } from "../../mock-main/app";
import type { MainOrderPayload } from "../../mock-main/types";

const order = (id = "order-1", quantity = 2): MainOrderPayload => ({
  id,
  code: "ABC-261014-ABCDE",
  createdAt: "2026-10-14T08:00:00.000Z",
  customer: { name: "Nguyễn Văn An", email: "an@example.com", phone: "0901234567" },
  shippingAddress: { line1: "1 Lê Lợi", ward: "Bến Nghé", district: "Quận 1", province: "TP.HCM" },
  shippingMethod: "STANDARD",
  shippingFee: 30_000,
  itemsTotal: 658_000,
  codAmount: 688_000,
  items: [
    {
      sku: "P001-DEN-M",
      productName: "Áo thun nam cổ tròn basic",
      size: "M",
      color: "Đen",
      unitPrice: 329_000,
      quantity,
    },
  ],
});

describe("mock-main IF-03 / IF-04 / fail-mode", () => {
  let app = buildMockMain({ hangMs: 50 });
  afterEach(async () => {
    await app.close();
    app = buildMockMain({ hangMs: 50 });
  });

  const stockOf = async (sku: string) => {
    const { items } = (await app.inject({ method: "GET", url: "/main/stock" })).json() as {
      items: { sku: string; qty: number }[];
    };
    return items.find((i) => i.sku === sku)?.qty;
  };

  it("IF-03 reports shortages per SKU (duplicate lines are added up)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/main/stock-check",
      payload: {
        lines: [
          { sku: "P001-HONG-M", qty: 1 }, // 1 in stock
          { sku: "P001-HONG-M", qty: 1 },
          { sku: "P001-DEN-M", qty: 2 },
          { sku: "NOPE", qty: 1 },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      ok: false,
      shortages: [
        { sku: "P001-HONG-M", requested: 2, available: 1 },
        { sku: "NOPE", requested: 1, available: 0 },
      ],
    });

    const ok = await app.inject({
      method: "POST",
      url: "/main/stock-check",
      payload: { lines: [{ sku: "P001-DEN-M", qty: 2 }] },
    });
    expect(ok.json()).toEqual({ ok: true, shortages: [] });
  });

  it("IF-04 creates an order once, takes stock, and answers repeats with the same id", async () => {
    const before = (await stockOf("P001-DEN-M"))!;
    const first = await app.inject({ method: "POST", url: "/main/orders", payload: order() });
    expect(first.statusCode).toBe(201);
    const { mainOrderId } = first.json();
    expect(mainOrderId).toMatch(/^MO-[0-9A-Z]+-\d{4}$/);
    expect(await stockOf("P001-DEN-M")).toBe(before - 2);

    const again = await app.inject({ method: "POST", url: "/main/orders", payload: order() });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ mainOrderId, duplicate: true });
    expect(await stockOf("P001-DEN-M")).toBe(before - 2);

    const { orders } = (await app.inject({ method: "GET", url: "/sim/orders" })).json();
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ mainOrderId, deliveries: 2, status: "RECEIVED" });
  });

  it("rejects malformed requests with 400", async () => {
    const bad = { ...order(), items: [] };
    expect(
      (await app.inject({ method: "POST", url: "/main/orders", payload: bad })).statusCode,
    ).toBe(400);
    const badCheck = await app.inject({
      method: "POST",
      url: "/main/stock-check",
      payload: { lines: [{ sku: "A", qty: 0 }] },
    });
    expect(badCheck.statusCode).toBe(400);
  });

  it("fail-mode error/timeout breaks /main/* only, optionally for N requests", async () => {
    await app.inject({ method: "POST", url: "/sim/fail-mode", payload: { mode: "error" } });
    expect((await app.inject({ method: "GET", url: "/main/stock" })).statusCode).toBe(503);
    expect((await app.inject({ method: "GET", url: "/main/stock" })).statusCode).toBe(503);
    expect((await app.inject({ method: "GET", url: "/healthz" })).statusCode).toBe(200);

    await app.inject({
      method: "POST",
      url: "/sim/fail-mode",
      payload: { mode: "timeout", count: 1 },
    });
    const started = Date.now();
    expect((await app.inject({ method: "GET", url: "/main/stock" })).statusCode).toBe(504);
    expect(Date.now() - started).toBeGreaterThanOrEqual(45);
    expect((await app.inject({ method: "GET", url: "/main/stock" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/sim/fail-mode" })).json()).toEqual({
      mode: "none",
      remaining: null,
      only: null,
    });

    const bad = await app.inject({ method: "POST", url: "/sim/fail-mode", payload: { mode: "x" } });
    expect(bad.statusCode).toBe(400);
  });

  it("a failed order request does not create the order", async () => {
    await app.inject({
      method: "POST",
      url: "/sim/fail-mode",
      payload: { mode: "error", count: 1 },
    });
    expect(
      (await app.inject({ method: "POST", url: "/main/orders", payload: order() })).statusCode,
    ).toBe(503);
    expect((await app.inject({ method: "GET", url: "/sim/orders" })).json().orders).toHaveLength(0);
    expect(
      (await app.inject({ method: "POST", url: "/main/orders", payload: order() })).statusCode,
    ).toBe(201);
  });
});

describe("mock-main order ids", () => {
  it("stay unique across mock restarts", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const app = buildMockMain();
      ids.push(
        (await app.inject({ method: "POST", url: "/main/orders", payload: order() })).json()
          .mainOrderId,
      );
      await app.close();
      await new Promise((r) => setTimeout(r, 5)); // a later boot
    }
    expect(ids[0]).not.toBe(ids[1]);
  });
});
