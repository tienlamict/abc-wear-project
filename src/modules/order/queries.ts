import { prisma } from "@/lib/db";
import { findShippingMethod } from "./shipping";

export interface OrderConfirmation {
  code: string;
  customerName: string;
  customerEmail: string;
  shippingMethodName: string;
  shippingFee: number;
  itemsTotal: number;
  codAmount: number;
  itemCount: number;
  createdAt: Date;
}

/**
 * OD-04 thank-you page. Only the member who owns the order, or the browser that just placed
 * it (`lastOrderCode` cookie), may see it; anyone else gets null.
 */
export async function getOrderConfirmation(
  code: string,
  viewer: { memberId: string | null; lastOrderCode: string | null },
): Promise<OrderConfirmation | null> {
  const order = await prisma.order.findUnique({
    where: { code },
    include: { items: { select: { quantity: true } } },
  });
  if (!order) return null;
  const allowed =
    (order.memberId !== null && order.memberId === viewer.memberId) ||
    viewer.lastOrderCode === order.code;
  if (!allowed) return null;

  return {
    code: order.code,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    shippingMethodName: findShippingMethod(order.shippingMethod)?.name ?? order.shippingMethod,
    shippingFee: order.shippingFee,
    itemsTotal: order.itemsTotal,
    codAmount: order.codAmount,
    itemCount: order.items.reduce((n, i) => n + i.quantity, 0),
    createdAt: order.createdAt,
  };
}
