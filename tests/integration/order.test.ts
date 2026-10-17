import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CartOwner } from "@/lib/cart-session";
import { prisma } from "@/lib/db";
import type { EmailMessage } from "@/lib/email";
import { ORDER_CODE_PATTERN } from "@/lib/order-code";
import { HttpMainSystemClient, syncCatalog, syncStock } from "@/modules/integration";
import { register, updateProfile } from "@/modules/member";
import {
  MAX_SEND_ATTEMPTS,
  addItem,
  getCart,
  getCartItemCount,
  mergeGuestCart,
  placeOrder,
  removeItem,
  retryDelayMs,
  sendPendingOrders,
  updateItem,
} from "@/modules/order";
import seedJson from "../../mock-main/seed.json";
import type { Seed } from "../../mock-main/types";
import { mockOrders, resetCatalog, resetMembers, setFailMode, startMockMain } from "./helpers";

const sent: EmailMessage[] = [];
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendEmail: vi.fn(async (message: EmailMessage) => {
    sent.push(message);
  }),
  sendEmailInBackground: vi.fn((message: EmailMessage) => {
    sent.push(message);
  }),
}));

const seed = seedJson as Seed;
const variant = (sku: string) =>
  seed.products.flatMap((p) => p.variants).find((v) => v.sku === sku)!;
// Seed facts these tests rely on.
const ONE_LEFT = "P000001-M-HONG"; // qty 1
const SOLD_OUT = "P000001-L-HONG"; // qty 0
const PLENTY = "P000001-M-DEN"; // qty 38
const PLENTY_2 = "P000001-XL-HONG"; // qty 36

const checkout = {
  customerName: "Nguyễn Văn An",
  customerEmail: "An.Nguyen@Example.com",
  customerPhone: "0901 234 567",
  shipLine1: "12 Lý Thường Kiệt",
  shipWard: "Phường Hàng Bài",
  shipDistrict: "Quận Hoàn Kiếm",
  shipProvince: "Hà Nội",
  shippingMethod: "STANDARD",
};

const guest = (): CartOwner => ({ sessionId: randomUUID() });

describe("cart, placeOrder and IF-04 sending against the real mock Main System", () => {
  let mock: Awaited<ReturnType<typeof startMockMain>>;
  let client: HttpMainSystemClient;

  beforeAll(async () => {
    expect(variant(ONE_LEFT).qty).toBe(1);
    expect(variant(SOLD_OUT).qty).toBe(0);
    expect(variant(PLENTY).qty).toBeGreaterThan(20);
    await resetMembers();
    await resetCatalog();
    const loader = await startMockMain();
    try {
      const c = new HttpMainSystemClient({ baseUrl: loader.baseUrl, timeoutMs: 3000 });
      await syncCatalog(c);
      await syncStock(c);
    } finally {
      await loader.app.close();
    }
  });

  beforeEach(async () => {
    await resetMembers();
    await prisma.syncLog.deleteMany();
    sent.length = 0;
    // A fresh mock per test: its stock and received orders start from the seed again.
    mock = await startMockMain({ hangMs: 1500 });
    client = new HttpMainSystemClient({ baseUrl: mock.baseUrl, timeoutMs: 500 });
  });
  afterEach(() => mock.app.close());
  afterAll(() => prisma.$disconnect());

  describe("OD-01 cart (QT1, QT6, QT7)", () => {
    it("adds, accumulates, updates and removes lines with server-side prices", async () => {
      const owner = guest();
      await addItem(owner, { sku: PLENTY, quantity: 2 });
      let cart = await addItem(owner, { sku: PLENTY, quantity: "1" });
      expect(cart.lines).toHaveLength(1);
      expect(cart.lines[0]).toMatchObject({
        sku: PLENTY,
        quantity: 3,
        unitPrice: variant(PLENTY).price,
        lineTotal: 3 * variant(PLENTY).price,
        problem: null,
      });

      cart = await addItem(owner, { sku: PLENTY_2 });
      expect(cart.itemCount).toBe(4);
      expect(cart.itemsTotal).toBe(3 * variant(PLENTY).price + variant(PLENTY_2).price);
      expect(await getCartItemCount(owner)).toBe(4);

      cart = await updateItem(owner, PLENTY, { quantity: 5 });
      expect(cart.lines.find((l) => l.sku === PLENTY)?.quantity).toBe(5);
      cart = await removeItem(owner, PLENTY_2);
      expect(cart.lines.map((l) => l.sku)).toEqual([PLENTY]);
      expect(await getCart(null)).toMatchObject({ lines: [], itemCount: 0 });
    });

    it("QT7 refuses more than 10 per line, counting what is already in the cart", async () => {
      const owner = guest();
      await addItem(owner, { sku: PLENTY, quantity: 8 });
      await expect(addItem(owner, { sku: PLENTY, quantity: 3 })).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("tối đa 10"),
      });
      await expect(updateItem(owner, PLENTY, { quantity: 11 })).rejects.toThrow();
      await expect(updateItem(owner, PLENTY, { quantity: 0 })).rejects.toThrow();
      expect((await getCart(owner)).lines[0]?.quantity).toBe(8);
    });

    it("QT1 refuses more than the local stock; QT6 refuses sold-out and unknown SKUs", async () => {
      const owner = guest();
      await expect(addItem(owner, { sku: ONE_LEFT, quantity: 2 })).rejects.toMatchObject({
        code: "OUT_OF_STOCK",
        message: expect.stringContaining("chỉ còn 1"),
      });
      await expect(addItem(owner, { sku: SOLD_OUT })).rejects.toMatchObject({
        code: "NOT_PURCHASABLE",
      });
      await expect(addItem(owner, { sku: "NOPE" })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(updateItem(owner, PLENTY, { quantity: 1 })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("flags lines that became unavailable", async () => {
      const owner = guest();
      await addItem(owner, { sku: PLENTY, quantity: 1 });
      await prisma.product.update({ where: { id: "P000001" }, data: { isActive: false } });
      try {
        const cart = await getCart(owner);
        expect(cart.hasProblems).toBe(true);
        expect(cart.lines[0]?.problem).toBe("UNAVAILABLE");
      } finally {
        await prisma.product.update({ where: { id: "P000001" }, data: { isActive: true } });
      }
    });

    it("QT10 merges a guest cart into the member cart, capped at 10 per line", async () => {
      const member = await register({
        email: "gop.gio@example.com",
        password: "matkhau123",
        fullName: "Gộp Giỏ",
      });
      const memberOwner = { memberId: member.id };
      await addItem(memberOwner, { sku: PLENTY, quantity: 9 });

      const sessionId = randomUUID();
      await addItem({ sessionId }, { sku: PLENTY, quantity: 3 });
      await addItem({ sessionId }, { sku: PLENTY_2, quantity: 1 });

      expect(await mergeGuestCart(sessionId, member.id)).toBe(2);
      const cart = await getCart(memberOwner);
      expect(Object.fromEntries(cart.lines.map((l) => [l.sku, l.quantity]))).toEqual({
        [PLENTY]: 10,
        [PLENTY_2]: 1,
      });
      expect(await prisma.cart.findUnique({ where: { sessionId } })).toBeNull();

      // A member without a cart simply takes over the guest cart.
      const other = await register({
        email: "chua.co.gio@example.com",
        password: "matkhau123",
        fullName: "Chưa Có Giỏ",
      });
      const sid2 = randomUUID();
      await addItem({ sessionId: sid2 }, { sku: PLENTY, quantity: 2 });
      await mergeGuestCart(sid2, other.id);
      expect((await getCart({ memberId: other.id })).itemCount).toBe(2);
      expect(await mergeGuestCart(randomUUID(), other.id)).toBe(0);
    });
  });

  describe("placeOrder (OD-02, OD-03, OD-04)", () => {
    it("creates a CONFIRMED order with snapshots, clears the cart and emails a confirmation", async () => {
      const owner = guest();
      await addItem(owner, { sku: PLENTY, quantity: 2 });
      await addItem(owner, { sku: PLENTY_2, quantity: 1 });
      const itemsTotal = 2 * variant(PLENTY).price + variant(PLENTY_2).price;

      const result = await placeOrder({
        owner,
        memberId: null,
        idempotencyKey: randomUUID(),
        input: { ...checkout, shippingMethod: "EXPRESS" },
        client,
      });
      expect(result.created).toBe(true);
      expect(result.code).toMatch(ORDER_CODE_PATTERN);
      expect(result.codAmount).toBe(itemsTotal + 50_000); // OD-03: items + shipping fee

      const order = await prisma.order.findUniqueOrThrow({
        where: { code: result.code },
        include: { items: true },
      });
      expect(order).toMatchObject({
        status: "CONFIRMED",
        memberId: null,
        customerEmail: "an.nguyen@example.com",
        customerPhone: "0901234567",
        shipProvince: "Hà Nội",
        shippingMethod: "EXPRESS",
        shippingFee: 50_000,
        itemsTotal,
        codAmount: itemsTotal + 50_000,
        sendAttempts: 0,
      });
      expect(order.nextSendAt!.getTime()).toBeLessThanOrEqual(Date.now());
      expect(order.items).toHaveLength(2);
      expect(order.items.find((i) => i.sku === PLENTY)).toMatchObject({
        productName: "Áo thun nam cổ tròn basic",
        size: "M",
        color: "Đen",
        unitPrice: variant(PLENTY).price,
        quantity: 2,
      });
      expect((await getCart(owner)).lines).toHaveLength(0);

      expect(sent).toHaveLength(1);
      expect(sent[0]!.to).toBe("an.nguyen@example.com");
      expect(sent[0]!.subject).toContain(result.code);
      expect(sent[0]!.text).toContain("Áo thun nam cổ tròn basic");
      expect(sent[0]!.text).toMatch(/COD\): [\d.]+ ₫/);

      const logs = await prisma.syncLog.findMany({ where: { iface: "IF-03" } });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ direction: "OUT", result: "OK" });
    });

    it("QT8 the same Idempotency-Key returns the same order, even when sent at once", async () => {
      const owner = guest();
      await addItem(owner, { sku: PLENTY, quantity: 1 });
      const key = randomUUID();
      const params = { owner, memberId: null, idempotencyKey: key, input: checkout, client };

      const [a, b] = await Promise.all([placeOrder(params), placeOrder(params)]);
      expect(a.code).toBe(b.code);
      await addItem(owner, { sku: PLENTY, quantity: 1 }); // a refilled cart changes nothing
      const c = await placeOrder(params);
      expect(c).toEqual({ code: a.code, codAmount: a.codAmount, created: false });
      expect(await prisma.order.count()).toBe(1);
      expect(sent).toHaveLength(1);
    });

    it("refuses an empty cart, sold-out lines and invalid input", async () => {
      const owner = guest();
      const params = { owner, memberId: null, input: checkout, client };
      await expect(placeOrder({ ...params, idempotencyKey: randomUUID() })).rejects.toMatchObject({
        code: "CART_EMPTY",
      });
      await expect(placeOrder({ ...params, idempotencyKey: "abc" })).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });

      await addItem(owner, { sku: PLENTY, quantity: 1 });
      await expect(
        placeOrder({
          ...params,
          idempotencyKey: randomUUID(),
          input: { ...checkout, customerPhone: "123", shipWard: "", shippingMethod: "BAY" },
        }),
      ).rejects.toMatchObject({
        issues: expect.arrayContaining([
          expect.objectContaining({ path: ["customerPhone"] }),
          expect.objectContaining({ path: ["shipWard"], message: "Vui lòng nhập phường/xã" }),
          expect.objectContaining({ path: ["shippingMethod"] }),
        ]),
      });

      await prisma.productVariant.update({ where: { sku: PLENTY }, data: { availableQty: 0 } });
      try {
        await expect(placeOrder({ ...params, idempotencyKey: randomUUID() })).rejects.toMatchObject(
          { code: "NOT_PURCHASABLE", details: { skus: [PLENTY] } },
        );
      } finally {
        await prisma.productVariant.update({
          where: { sku: PLENTY },
          data: { availableQty: variant(PLENTY).qty },
        });
      }
      expect(await prisma.order.count()).toBe(0);
    });

    it("QT1 IF-03 is decisive: Main's shortage blocks the order even if local stock is fine", async () => {
      const lowSeed = structuredClone(seed);
      lowSeed.products[0]!.variants.find((v) => v.sku === PLENTY)!.qty = 1;
      const low = await startMockMain({ seed: lowSeed });
      try {
        const lowClient = new HttpMainSystemClient({ baseUrl: low.baseUrl, timeoutMs: 1000 });
        const owner = guest();
        await addItem(owner, { sku: PLENTY, quantity: 3 });
        await expect(
          placeOrder({
            owner,
            memberId: null,
            idempotencyKey: randomUUID(),
            input: checkout,
            client: lowClient,
          }),
        ).rejects.toMatchObject({
          code: "OUT_OF_STOCK",
          message: expect.stringContaining("chỉ còn 1"),
          details: { items: [{ sku: PLENTY, requested: 3, available: 1 }] },
        });
        expect(await prisma.order.count()).toBe(0);
        expect((await getCart(owner)).itemCount).toBe(3);
      } finally {
        await low.app.close();
      }
    });

    it("Main timeout → MAIN_UNAVAILABLE and no order", async () => {
      const owner = guest();
      await addItem(owner, { sku: PLENTY, quantity: 1 });
      await setFailMode(mock.baseUrl, "timeout");
      await expect(
        placeOrder({
          owner,
          memberId: null,
          idempotencyKey: randomUUID(),
          input: checkout,
          client,
        }),
      ).rejects.toMatchObject({ code: "MAIN_UNAVAILABLE" });
      expect(await prisma.order.count()).toBe(0);
      expect((await getCart(owner)).itemCount).toBe(1);
      expect(await prisma.syncLog.findFirst({ where: { iface: "IF-03" } })).toMatchObject({
        result: "ERROR",
      });
    });

    it("OD-02 a member order keeps its address snapshot when the profile changes", async () => {
      const member = await register({
        email: "thanh.vien@example.com",
        password: "matkhau123",
        fullName: "Thành Viên",
      });
      const owner = { memberId: member.id };
      await addItem(owner, { sku: PLENTY, quantity: 1 });
      const { code } = await placeOrder({
        owner,
        memberId: member.id,
        idempotencyKey: randomUUID(),
        input: checkout,
        client,
      });
      await updateProfile(member.id, { shipLine1: "99 Đường Mới", shipProvince: "Đà Nẵng" });

      const order = await prisma.order.findUniqueOrThrow({ where: { code } });
      expect(order).toMatchObject({
        memberId: member.id,
        shipLine1: "12 Lý Thường Kiệt",
        shipProvince: "Hà Nội",
      });
    });
  });

  describe("IF-04 sendPendingOrders", () => {
    async function newOrder(): Promise<string> {
      const owner = guest();
      await addItem(owner, { sku: PLENTY, quantity: 2 });
      const { code } = await placeOrder({
        owner,
        memberId: null,
        idempotencyKey: randomUUID(),
        input: checkout,
        client,
      });
      return code;
    }

    it("sends a due order: SENT_TO_MAIN with mainOrderId, logged OK", async () => {
      const code = await newOrder();
      expect(await sendPendingOrders(client)).toEqual({ sent: 1, retrying: 0, gaveUp: 0 });

      const order = await prisma.order.findUniqueOrThrow({ where: { code } });
      expect(order).toMatchObject({
        status: "SENT_TO_MAIN",
        nextSendAt: null,
        sendAttempts: 1,
        lastSendError: null,
      });
      const received = await mockOrders(mock.baseUrl);
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({ mainOrderId: order.mainOrderId, deliveries: 1 });
      expect(received[0]!.payload).toMatchObject({
        id: order.id,
        code,
        codAmount: order.codAmount,
      });
      expect(
        await prisma.syncLog.findFirst({ where: { iface: "IF-04", recordKey: code } }),
      ).toMatchObject({ result: "OK" });

      expect(await sendPendingOrders(client)).toEqual({ sent: 0, retrying: 0, gaveUp: 0 });
    });

    it("IN-02 retries after a temporary failure with backoff; Main gets the order once", async () => {
      const code = await newOrder();
      await setFailMode(mock.baseUrl, "error", 1);

      const t0 = new Date();
      expect(await sendPendingOrders(client, () => t0)).toEqual({
        sent: 0,
        retrying: 1,
        gaveUp: 0,
      });
      let order = await prisma.order.findUniqueOrThrow({ where: { code } });
      expect(order.status).toBe("CONFIRMED");
      expect(order.sendAttempts).toBe(1);
      expect(order.nextSendAt!.getTime()).toBe(t0.getTime() + retryDelayMs(1)); // 10 s
      expect(order.lastSendError).toContain("503");
      expect(
        await prisma.syncLog.findFirst({ where: { iface: "IF-04", result: "RETRY" } }),
      ).toMatchObject({ recordKey: code });

      // Not due yet.
      expect((await sendPendingOrders(client, () => t0)).sent).toBe(0);

      const later = new Date(t0.getTime() + retryDelayMs(1));
      expect((await sendPendingOrders(client, () => later)).sent).toBe(1);
      order = await prisma.order.findUniqueOrThrow({ where: { code } });
      expect(order.status).toBe("SENT_TO_MAIN");
      expect(await mockOrders(mock.baseUrl)).toHaveLength(1);
    });

    it("IN-02 a resend after a lost response does not duplicate the order in Main", async () => {
      const code = await newOrder();
      await sendPendingOrders(client);
      const first = await prisma.order.findUniqueOrThrow({ where: { code } });

      // As if the response had been lost: the order is still queued on our side.
      await prisma.order.update({
        where: { code },
        data: { status: "CONFIRMED", nextSendAt: new Date(), mainOrderId: null },
      });
      await sendPendingOrders(client);

      const received = await mockOrders(mock.baseUrl);
      expect(received).toHaveLength(1);
      expect(received[0]!.deliveries).toBe(2);
      const again = await prisma.order.findUniqueOrThrow({ where: { code } });
      expect(again.mainOrderId).toBe(first.mainOrderId);
    });

    it(`gives up after ${MAX_SEND_ATTEMPTS} failures and logs ERROR`, async () => {
      const code = await newOrder();
      await setFailMode(mock.baseUrl, "error");
      let t = Date.now();
      for (let i = 1; i <= MAX_SEND_ATTEMPTS; i++) {
        const r = await sendPendingOrders(client, () => new Date(t));
        expect(r).toEqual(
          i < MAX_SEND_ATTEMPTS
            ? { sent: 0, retrying: 1, gaveUp: 0 }
            : { sent: 0, retrying: 0, gaveUp: 1 },
        );
        t += retryDelayMs(i);
      }
      const order = await prisma.order.findUniqueOrThrow({ where: { code } });
      expect(order).toMatchObject({
        status: "CONFIRMED",
        sendAttempts: MAX_SEND_ATTEMPTS,
        nextSendAt: null,
      });
      const logs = await prisma.syncLog.findMany({
        where: { iface: "IF-04", recordKey: code },
        orderBy: { createdAt: "asc" },
      });
      // One ERROR row per failed call (client) + RETRY rows + the final give-up ERROR (worker).
      expect(logs.filter((l) => l.result === "RETRY")).toHaveLength(MAX_SEND_ATTEMPTS - 1);
      expect(logs.at(-1)).toMatchObject({
        result: "ERROR",
        message: expect.stringContaining(`giving up after ${MAX_SEND_ATTEMPTS} attempts`),
      });
      expect(await mockOrders(mock.baseUrl)).toHaveLength(0);
    });
  });
});

describe("retryDelayMs", () => {
  it("doubles from 10 s and caps at 10 minutes", () => {
    expect([1, 2, 3, 6, 7, 10].map(retryDelayMs)).toEqual([
      10_000, 20_000, 40_000, 320_000, 600_000, 600_000,
    ]);
  });
});
