import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as orderStatusWebhook } from "../../app/api/integration/order-status/route";
import { getConfig } from "@/lib/config";
import { prisma } from "@/lib/db";
import type { EmailMessage } from "@/lib/email";
import { HttpMainSystemClient, syncCatalog, syncStock } from "@/modules/integration";
import { register } from "@/modules/member";
import {
  addItem,
  buildTimeline,
  getMemberOrder,
  listMemberOrders,
  lookupGuestOrder,
  placeOrder,
  sendPendingOrders,
} from "@/modules/order";
import { resetCatalog, resetMembers, startMockMain } from "./helpers";

const sent: EmailMessage[] = [];
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendEmail: vi.fn(async (message: EmailMessage) => {
    sent.push(message);
  }),
}));

const checkout = {
  customerName: "Lê Thị Hoa",
  customerEmail: "Hoa.Le@Example.com",
  customerPhone: "0903 111 222",
  shipLine1: "5 Nguyễn Trãi",
  shipWard: "Phường 2",
  shipDistrict: "Quận 5",
  shipProvince: "TP. Hồ Chí Minh",
  shippingMethod: "STANDARD",
};

function webhook(body: unknown, secret: string | null = getConfig().MAIN_WEBHOOK_SECRET) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== null) headers["x-main-secret"] = secret;
  return orderStatusWebhook(
    new Request("http://localhost/api/integration/order-status", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

describe("IF-05 webhook and order tracking (OD-05, OD-06)", () => {
  let mock: Awaited<ReturnType<typeof startMockMain>>;
  let client: HttpMainSystemClient;

  /** Places an order and lets the worker send it, so it has a mainOrderId. */
  async function sentOrder(memberId: string | null = null) {
    const owner = memberId ? { memberId } : { sessionId: randomUUID() };
    await addItem(owner, { sku: "P001-DEN-M", quantity: 1 });
    const { code } = await placeOrder({
      owner,
      memberId,
      idempotencyKey: randomUUID(),
      input: checkout,
      client,
    });
    await sendPendingOrders(client);
    return prisma.order.findUniqueOrThrow({ where: { code } });
  }

  beforeAll(async () => {
    await resetMembers();
    await resetCatalog();
    mock = await startMockMain();
    client = new HttpMainSystemClient({ baseUrl: mock.baseUrl, timeoutMs: 3000 });
    await syncCatalog(client);
    await syncStock(client);
  });
  beforeEach(async () => {
    await resetMembers();
    await prisma.syncLog.deleteMany();
    sent.length = 0;
  });
  afterAll(async () => {
    await mock.app.close();
    await prisma.$disconnect();
  });

  it("rejects a missing or wrong x-main-secret with 401 and logs it", async () => {
    const order = await sentOrder();
    const body = { mainOrderId: order.mainOrderId, status: "PICKING" };
    expect((await webhook(body, null)).status).toBe(401);
    const wrong = await webhook(body, "doan-bua");
    expect(wrong.status).toBe(401);
    expect((await wrong.json()).error.code).toBe("UNAUTHORIZED");
    expect(await prisma.syncLog.count({ where: { iface: "IF-05", result: "ERROR" } })).toBe(2);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      "SENT_TO_MAIN",
    );
  });

  it("applies PICKING → SHIPPING → DELIVERED, ignores repeats, emails on SHIPPING and DELIVERED", async () => {
    const order = await sentOrder();
    expect(order.status).toBe("SENT_TO_MAIN");
    const id = order.mainOrderId!;
    sent.length = 0;

    const picking = await webhook({ mainOrderId: id, status: "PICKING" });
    expect(picking.status).toBe(200);
    expect(await picking.json()).toEqual({
      result: "changed",
      code: order.code,
      status: "PICKING",
    });
    // Same status again: idempotent no-op.
    expect(await (await webhook({ mainOrderId: id, status: "PICKING" })).json()).toMatchObject({
      result: "unchanged",
    });
    expect(sent).toHaveLength(0);

    await webhook({ mainOrderId: id, status: "SHIPPING", trackingNumber: "VN000123" });
    let row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row).toMatchObject({ status: "SHIPPING", trackingNumber: "VN000123" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "hoa.le@example.com" });
    expect(sent[0]!.subject).toBe(`Đơn hàng ${order.code} đang được giao`);
    expect(sent[0]!.text).toContain("VN000123");

    await webhook({ mainOrderId: id, status: "DELIVERED" });
    expect(sent).toHaveLength(2);
    expect(sent[1]!.subject).toBe(`Đơn hàng ${order.code} đã giao thành công`);

    // Invalid after the end: ignored, logged as ERROR, status kept.
    const invalid = await webhook({ mainOrderId: id, status: "DELIVERY_FAILED" });
    expect(invalid.status).toBe(200);
    expect(await invalid.json()).toMatchObject({ result: "invalid", status: "DELIVERED" });
    row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe("DELIVERED");

    const logs = await prisma.syncLog.findMany({
      where: { iface: "IF-05", recordKey: order.code },
      orderBy: { createdAt: "asc" },
    });
    expect(logs.map((l) => l.result)).toEqual(["OK", "OK", "OK", "OK", "ERROR"]);
    expect(logs[0]!.message).toBe("SENT_TO_MAIN → PICKING");
    expect(sent).toHaveLength(2);
  });

  it("refuses skipping a step, an unknown order and a bad payload", async () => {
    const order = await sentOrder();
    const skip = await webhook({ mainOrderId: order.mainOrderId, status: "DELIVERED" });
    expect(await skip.json()).toMatchObject({ result: "invalid", status: "SENT_TO_MAIN" });

    const unknown = await webhook({ mainOrderId: "MO-999999", status: "PICKING" });
    expect(unknown.status).toBe(404);
    const bad = await webhook({ mainOrderId: order.mainOrderId, status: "LOST" });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("updates the newest order if Main ever reuses a mainOrderId", async () => {
    const old = await sentOrder();
    const recent = await sentOrder();
    await prisma.order.update({
      where: { id: old.id },
      data: { mainOrderId: recent.mainOrderId, createdAt: new Date(Date.now() - 86_400_000) },
    });
    await webhook({ mainOrderId: recent.mainOrderId, status: "PICKING" });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: recent.id } })).status).toBe(
      "PICKING",
    );
    expect((await prisma.order.findUniqueOrThrow({ where: { id: old.id } })).status).toBe(
      "SENT_TO_MAIN",
    );
  });

  it("DELIVERY_FAILED is possible from SHIPPING", async () => {
    const order = await sentOrder();
    const id = order.mainOrderId!;
    await webhook({ mainOrderId: id, status: "PICKING" });
    await webhook({ mainOrderId: id, status: "SHIPPING" });
    await webhook({ mainOrderId: id, status: "DELIVERY_FAILED" });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      "DELIVERY_FAILED",
    );
  });

  it("OD-05 lookup by code + email; a wrong email or code says the order was not found", async () => {
    const order = await sentOrder();
    const detail = await lookupGuestOrder({
      code: order.code.toLowerCase(),
      email: " HOA.LE@example.com ",
    });
    expect(detail).toMatchObject({
      code: order.code,
      status: "SENT_TO_MAIN",
      statusLabel: "Đã chuyển kho",
      shippingMethodName: "Tiêu chuẩn",
      codAmount: order.codAmount,
    });
    expect(detail.items).toHaveLength(1);

    for (const input of [
      { code: order.code, email: "nguoi.khac@example.com" },
      { code: "ABC-000000-AAAAA", email: "hoa.le@example.com" },
    ]) {
      await expect(lookupGuestOrder(input)).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: expect.stringContaining("Không tìm thấy đơn"),
      });
    }
    await expect(lookupGuestOrder({ code: "", email: "x" })).rejects.toThrow();
  });

  it("OD-06 a member sees only their own orders, newest first", async () => {
    const a = await register({ email: "a@example.com", password: "matkhau123", fullName: "A" });
    const b = await register({ email: "b@example.com", password: "matkhau123", fullName: "B" });
    const first = await sentOrder(a.id);
    const second = await sentOrder(a.id);
    const ofB = await sentOrder(b.id);
    await prisma.order.update({
      where: { id: first.id },
      data: { createdAt: new Date(Date.now() - 60_000) },
    });

    const list = await listMemberOrders(a.id);
    expect(list.total).toBe(2);
    expect(list.items.map((o) => o.code)).toEqual([second.code, first.code]);
    expect(list.items[0]).toMatchObject({ statusLabel: "Đã chuyển kho", itemCount: 1 });

    expect(await getMemberOrder(a.id, second.code)).toMatchObject({ code: second.code });
    expect(await getMemberOrder(a.id, ofB.code)).toBeNull();
    expect(await getMemberOrder(b.id, first.code)).toBeNull();
    expect((await listMemberOrders(b.id)).items.map((o) => o.code)).toEqual([ofB.code]);
  });
});

describe("buildTimeline", () => {
  it("marks past steps done, the current one, and DELIVERY_FAILED as failed", () => {
    expect(buildTimeline("PICKING").map((s) => [s.status, s.state])).toEqual([
      ["CONFIRMED", "done"],
      ["SENT_TO_MAIN", "done"],
      ["PICKING", "current"],
      ["SHIPPING", "upcoming"],
      ["DELIVERED", "upcoming"],
    ]);
    expect(buildTimeline("DELIVERY_FAILED").map((s) => s.state)).toEqual([
      "done",
      "done",
      "done",
      "done",
      "failed",
    ]);
    expect(buildTimeline("DELIVERED").at(-1)).toMatchObject({
      label: "Đã giao hàng",
      state: "current",
    });
  });
});
