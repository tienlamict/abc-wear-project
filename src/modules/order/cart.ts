import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { CartOwner } from "@/lib/cart-session";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

/** QT7: each cart line holds 1–10 items. */
export const MAX_LINE_QTY = 10;

export interface CartLine {
  sku: string;
  productId: string;
  productName: string;
  image: string | null;
  size: string;
  color: string;
  unitPrice: number;
  quantity: number;
  availableQty: number;
  lineTotal: number;
  /** UNAVAILABLE: QT6 (inactive or sold out); INSUFFICIENT_STOCK: more than the local stock. */
  problem: "UNAVAILABLE" | "INSUFFICIENT_STOCK" | null;
}

export interface CartView {
  lines: CartLine[];
  itemCount: number;
  itemsTotal: number;
  hasProblems: boolean;
}

const EMPTY_CART: CartView = { lines: [], itemCount: 0, itemsTotal: 0, hasProblems: false };

const quantitySchema = z.coerce
  .number({ error: "Số lượng không hợp lệ" })
  .int("Số lượng phải là số nguyên")
  .min(1, `Số lượng từ 1 đến ${MAX_LINE_QTY}`)
  .max(MAX_LINE_QTY, `Mỗi sản phẩm tối đa ${MAX_LINE_QTY} trong một đơn hàng`);

const addItemSchema = z.object({
  sku: z.string({ error: "Vui lòng chọn phiên bản sản phẩm" }).trim().min(1).max(64),
  quantity: quantitySchema.default(1),
});

const updateItemSchema = z.object({ quantity: quantitySchema });

const ownerWhere = (owner: CartOwner): Prisma.CartWhereUniqueInput =>
  "memberId" in owner ? { memberId: owner.memberId } : { sessionId: owner.sessionId };

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

async function ensureCartId(owner: CartOwner): Promise<string> {
  const where = ownerWhere(owner);
  const existing = await prisma.cart.findUnique({ where, select: { id: true } });
  if (existing) return existing.id;
  try {
    return (await prisma.cart.create({ data: { ...owner }, select: { id: true } })).id;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return (await prisma.cart.findUniqueOrThrow({ where, select: { id: true } })).id; // created concurrently
  }
}

const toImages = (value: Prisma.JsonValue) =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

/** Cart lines priced from the current variant data (QT5), with QT1/QT6 problems flagged. */
async function buildLines(items: { sku: string; quantity: number }[]): Promise<CartLine[]> {
  if (items.length === 0) return [];
  const variants = await prisma.productVariant.findMany({
    where: { sku: { in: items.map((i) => i.sku) } },
    include: { product: { select: { id: true, name: true, images: true, isActive: true } } },
  });
  const bySku = new Map(variants.map((v) => [v.sku, v]));

  return items.map(({ sku, quantity }): CartLine => {
    const v = bySku.get(sku);
    if (!v) {
      return {
        sku,
        productId: "",
        productName: "Sản phẩm không còn bán",
        image: null,
        size: "",
        color: "",
        unitPrice: 0,
        quantity,
        availableQty: 0,
        lineTotal: 0,
        problem: "UNAVAILABLE",
      };
    }
    const purchasable = v.product.isActive && v.availableQty > 0;
    return {
      sku,
      productId: v.product.id,
      productName: v.product.name,
      image: toImages(v.product.images)[0] ?? null,
      size: v.size,
      color: v.color,
      unitPrice: v.price,
      quantity,
      availableQty: Math.max(0, v.availableQty),
      lineTotal: v.price * quantity,
      problem: !purchasable
        ? "UNAVAILABLE"
        : quantity > v.availableQty
          ? "INSUFFICIENT_STOCK"
          : null,
    };
  });
}

function toView(lines: CartLine[]): CartView {
  return {
    lines,
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    itemsTotal: lines.reduce((n, l) => n + l.lineTotal, 0),
    hasProblems: lines.some((l) => l.problem !== null),
  };
}

/** OD-01: the cart of a member or guest; null owner = empty cart. Lines ordered by SKU. */
export async function getCart(owner: CartOwner | null): Promise<CartView> {
  if (!owner) return EMPTY_CART;
  const cart = await prisma.cart.findUnique({
    where: ownerWhere(owner),
    select: { items: { select: { sku: true, quantity: true }, orderBy: { sku: "asc" } } },
  });
  if (!cart) return EMPTY_CART;
  return toView(await buildLines(cart.items));
}

/** Header badge: total quantity, without loading product data. */
export async function getCartItemCount(owner: CartOwner | null): Promise<number> {
  if (!owner) return 0;
  const cart = await prisma.cart.findUnique({ where: ownerWhere(owner), select: { id: true } });
  if (!cart) return 0;
  const { _sum } = await prisma.cartItem.aggregate({
    where: { cartId: cart.id },
    _sum: { quantity: true },
  });
  return _sum.quantity ?? 0;
}

/** QT6 then QT7 then QT1 (against the local stock copy; IF-03 decides at checkout). */
async function assertCanHold(sku: string, quantity: number, alreadyInCart: number) {
  const variant = await prisma.productVariant.findUnique({
    where: { sku },
    include: { product: { select: { isActive: true } } },
  });
  if (!variant) throw new AppError("NOT_FOUND", "Không tìm thấy sản phẩm.");
  if (!variant.product.isActive || variant.availableQty <= 0) {
    throw new AppError("NOT_PURCHASABLE", "Sản phẩm này tạm hết hàng.", { sku });
  }
  if (quantity > MAX_LINE_QTY) {
    const message =
      alreadyInCart > 0
        ? `Mỗi sản phẩm tối đa ${MAX_LINE_QTY} trong một đơn hàng. Giỏ hàng đã có ${alreadyInCart}.`
        : `Mỗi sản phẩm tối đa ${MAX_LINE_QTY} trong một đơn hàng.`;
    throw new AppError("VALIDATION_ERROR", message, { fields: { quantity: message } });
  }
  if (quantity > variant.availableQty) {
    throw new AppError(
      "OUT_OF_STOCK",
      `Sản phẩm này chỉ còn ${variant.availableQty}. Vui lòng giảm số lượng.`,
      { sku, available: variant.availableQty },
    );
  }
}

/** OD-01: adds to the line (or creates it). */
export async function addItem(owner: CartOwner, input: unknown): Promise<CartView> {
  const { sku, quantity } = addItemSchema.parse(input);
  const cartId = await ensureCartId(owner);
  const existing = await prisma.cartItem.findUnique({
    where: { cartId_sku: { cartId, sku } },
    select: { quantity: true },
  });
  const inCart = existing?.quantity ?? 0;
  await assertCanHold(sku, inCart + quantity, inCart);
  await prisma.cartItem.upsert({
    where: { cartId_sku: { cartId, sku } },
    create: { cartId, sku, quantity },
    update: { quantity: inCart + quantity },
  });
  return getCart(owner);
}

/** OD-01: sets a line's quantity. */
export async function updateItem(owner: CartOwner, sku: string, input: unknown): Promise<CartView> {
  const { quantity } = updateItemSchema.parse(input);
  const cart = await prisma.cart.findUnique({ where: ownerWhere(owner), select: { id: true } });
  const line =
    cart && (await prisma.cartItem.findUnique({ where: { cartId_sku: { cartId: cart.id, sku } } }));
  if (!cart || !line) throw new AppError("NOT_FOUND", "Sản phẩm không có trong giỏ hàng.");
  await assertCanHold(sku, quantity, 0);
  await prisma.cartItem.update({
    where: { cartId_sku: { cartId: cart.id, sku } },
    data: { quantity },
  });
  return getCart(owner);
}

/** OD-01: removes a line; removing a missing line is a no-op. */
export async function removeItem(owner: CartOwner, sku: string): Promise<CartView> {
  const cart = await prisma.cart.findUnique({ where: ownerWhere(owner), select: { id: true } });
  if (cart) await prisma.cartItem.deleteMany({ where: { cartId: cart.id, sku } });
  return getCart(owner);
}

/**
 * QT10: after sign-in, moves the guest cart into the member's cart, adding quantities up to
 * 10 per line. Returns the number of guest lines merged.
 */
export async function mergeGuestCart(sessionId: string, memberId: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const guest = await tx.cart.findUnique({ where: { sessionId }, include: { items: true } });
    if (!guest || guest.items.length === 0) {
      if (guest) await tx.cart.delete({ where: { id: guest.id } });
      return 0;
    }
    const member = await tx.cart.findUnique({ where: { memberId }, include: { items: true } });
    if (!member) {
      await tx.cart.update({ where: { id: guest.id }, data: { memberId, sessionId: null } });
      return guest.items.length;
    }
    for (const item of guest.items) {
      const current = member.items.find((i) => i.sku === item.sku)?.quantity ?? 0;
      const quantity = Math.min(MAX_LINE_QTY, current + item.quantity);
      await tx.cartItem.upsert({
        where: { cartId_sku: { cartId: member.id, sku: item.sku } },
        create: { cartId: member.id, sku: item.sku, quantity },
        update: { quantity },
      });
    }
    await tx.cart.delete({ where: { id: guest.id } }); // items cascade
    return guest.items.length;
  });
}
