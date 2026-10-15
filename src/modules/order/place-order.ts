import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { CartOwner } from "@/lib/cart-session";
import { getConfig } from "@/lib/config";
import { prisma } from "@/lib/db";
import { sendEmailInBackground } from "@/lib/email";
import { AppError } from "@/lib/errors";
import { generateOrderCode } from "@/lib/order-code";
import { emailSchema, fullNameSchema, requiredPhoneSchema, requiredText } from "@/lib/validation";
import { type MainSystemClient, createMainSystemClient } from "@/modules/integration";
import { getCart } from "./cart";
import { orderConfirmationEmail } from "./emails";
import { findShippingMethod } from "./shipping";

export const checkoutSchema = z.object({
  customerName: fullNameSchema,
  customerEmail: emailSchema,
  customerPhone: requiredPhoneSchema,
  shipLine1: requiredText(255, "Địa chỉ"),
  shipWard: requiredText(100, "Phường/Xã"),
  shipDistrict: requiredText(100, "Quận/Huyện"),
  shipProvince: requiredText(100, "Tỉnh/Thành phố"),
  shippingMethod: z
    .string({ error: "Vui lòng chọn phương thức giao hàng" })
    .refine((code) => findShippingMethod(code) !== undefined, {
      error: "Vui lòng chọn phương thức giao hàng",
    }),
});

const idempotencyKeySchema = z.uuid();

export interface PlaceOrderParams {
  owner: CartOwner | null;
  /** Set for a signed-in member; the order then shows in their history. */
  memberId: string | null;
  /** QT8: from the `Idempotency-Key` header; one per checkout attempt. */
  idempotencyKey: string | null | undefined;
  input: unknown;
  client?: MainSystemClient;
}

export interface PlaceOrderResult {
  code: string;
  codAmount: number;
  /** false when the key was seen before and the existing order is returned. */
  created: boolean;
}

const MAX_CODE_ATTEMPTS = 5;

async function findByKey(idempotencyKey: string): Promise<PlaceOrderResult | null> {
  const order = await prisma.order.findUnique({
    where: { idempotencyKey },
    select: { code: true, codAmount: true },
  });
  return order && { ...order, created: false };
}

/**
 * OD-02/OD-03, flow of spec §8: idempotency → cart checks (QT6) → IF-03 (decisive, QT1) →
 * one transaction creating the order with price/address snapshots (QT2, QT5) and clearing the
 * ordered lines → confirmation email (failures only logged). The order starts CONFIRMED with
 * nextSendAt = now; the worker sends it to Main System (QT3).
 */
export async function placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult> {
  const key = idempotencyKeySchema.safeParse(params.idempotencyKey);
  if (!key.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Yêu cầu đặt hàng thiếu mã chống trùng. Vui lòng tải lại trang và thử lại.",
    );
  }
  const idempotencyKey = key.data;

  const replay = await findByKey(idempotencyKey);
  if (replay) return replay;

  const data = checkoutSchema.parse(params.input);
  const method = findShippingMethod(data.shippingMethod)!;

  const cart = await getCart(params.owner);
  if (cart.lines.length === 0) throw new AppError("CART_EMPTY");
  const unavailable = cart.lines.filter((l) => l.problem === "UNAVAILABLE");
  if (unavailable.length > 0) {
    throw new AppError(
      "NOT_PURCHASABLE",
      `Sản phẩm tạm hết hàng: ${unavailable.map((l) => l.productName).join(", ")}. Vui lòng bỏ khỏi giỏ hàng.`,
      { skus: unavailable.map((l) => l.sku) },
    );
  }

  const client = params.client ?? createMainSystemClient();
  let check;
  try {
    check = await client.checkStock(cart.lines.map((l) => ({ sku: l.sku, qty: l.quantity })));
  } catch (err) {
    console.error("[order] IF-03 stock check failed:", err instanceof Error ? err.message : err);
    throw new AppError("MAIN_UNAVAILABLE");
  }
  if (!check.ok) {
    const names = new Map(cart.lines.map((l) => [l.sku, l]));
    const items = check.shortages.map((s) => ({
      ...s,
      productName: names.get(s.sku)?.productName,
    }));
    throw new AppError(
      "OUT_OF_STOCK",
      `Không đủ hàng: ${items
        .map((i) => {
          const line = names.get(i.sku);
          return `${i.productName} (${line?.color}, size ${line?.size}) chỉ còn ${i.available}`;
        })
        .join("; ")}. Vui lòng giảm số lượng hoặc bỏ sản phẩm đó.`,
      { items },
    );
  }

  const itemsTotal = cart.itemsTotal;
  const codAmount = itemsTotal + method.fee;
  const cartId =
    params.owner &&
    (
      await prisma.cart.findUnique({
        where:
          "memberId" in params.owner
            ? { memberId: params.owner.memberId }
            : { sessionId: params.owner.sessionId },
        select: { id: true },
      })
    )?.id;

  let created: { id: string; code: string } | undefined;
  for (let attempt = 1; !created; attempt++) {
    const code = generateOrderCode();
    try {
      created = await prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            code,
            idempotencyKey,
            memberId: params.memberId,
            ...data,
            shippingMethod: method.code,
            shippingFee: method.fee,
            itemsTotal,
            codAmount,
            items: {
              create: cart.lines.map((l) => ({
                sku: l.sku,
                productName: l.productName,
                size: l.size,
                color: l.color,
                unitPrice: l.unitPrice,
                quantity: l.quantity,
              })),
            },
          },
          select: { id: true, code: true },
        });
        if (cartId) {
          await tx.cartItem.deleteMany({
            where: { cartId, sku: { in: cart.lines.map((l) => l.sku) } },
          });
        }
        return order;
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      const raced = await findByKey(idempotencyKey); // same key submitted twice at once
      if (raced) return raced;
      if (attempt >= MAX_CODE_ATTEMPTS) throw err; // order code collisions
    }
  }

  console.log(
    `[order] placed ${created.code} member=${params.memberId ?? "guest"} items=${cart.itemCount} cod=${codAmount}`,
  );

  // OD-04: the customer gets the code on screen now; the email follows without delaying it.
  const lookup = new URL("/tra-cuu-don", getConfig().WEB_BASE_URL);
  lookup.searchParams.set("code", created.code);
  sendEmailInBackground(
    orderConfirmationEmail(
      {
        code: created.code,
        ...data,
        shippingMethodName: method.name,
        shippingFee: method.fee,
        itemsTotal,
        codAmount,
        items: cart.lines,
      },
      lookup.toString(),
    ),
    `order confirmation ${created.code}`,
  );

  return { code: created.code, codAmount, created: true };
}
