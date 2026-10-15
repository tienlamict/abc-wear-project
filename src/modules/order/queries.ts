import type { Order, OrderItem, OrderStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { ORDER_PROGRESS, ORDER_STATUS_LABELS } from "@/lib/order-state";
import { emailSchema } from "@/lib/validation";
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

export const ORDERS_PAGE_SIZE = 10;

export interface TimelineStep {
  status: OrderStatus;
  label: string;
  state: "done" | "current" | "failed" | "upcoming";
}

export interface OrderDetail {
  code: string;
  status: OrderStatus;
  statusLabel: string;
  /** ISO strings so the detail can go straight to client components and JSON. */
  createdAt: string;
  updatedAt: string;
  trackingNumber: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shipLine1: string;
  shipWard: string;
  shipDistrict: string;
  shipProvince: string;
  shippingMethodName: string;
  shippingFee: number;
  itemsTotal: number;
  codAmount: number;
  items: {
    sku: string;
    productName: string;
    size: string;
    color: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }[];
  timeline: TimelineStep[];
}

export interface OrderSummary {
  code: string;
  status: OrderStatus;
  statusLabel: string;
  createdAt: string;
  codAmount: number;
  itemCount: number;
  firstItemName: string;
}

export interface MemberOrderPage {
  items: OrderSummary[];
  total: number;
  page: number;
  totalPages: number;
}

/**
 * Status steps for the order page. Only the current status is stored (no history table), so
 * steps before it are "done"; DELIVERY_FAILED replaces DELIVERED as the last step.
 */
export function buildTimeline(status: OrderStatus): TimelineStep[] {
  const steps: OrderStatus[] =
    status === "DELIVERY_FAILED"
      ? [...ORDER_PROGRESS.slice(0, -1), "DELIVERY_FAILED"]
      : [...ORDER_PROGRESS];
  const current = steps.indexOf(status);
  return steps.map((s, i) => ({
    status: s,
    label: ORDER_STATUS_LABELS[s],
    state:
      i < current
        ? "done"
        : i > current
          ? "upcoming"
          : s === "DELIVERY_FAILED"
            ? "failed"
            : "current",
  }));
}

function toDetail(order: Order & { items: OrderItem[] }): OrderDetail {
  return {
    code: order.code,
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status],
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    trackingNumber: order.trackingNumber,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    shipLine1: order.shipLine1,
    shipWard: order.shipWard,
    shipDistrict: order.shipDistrict,
    shipProvince: order.shipProvince,
    shippingMethodName: findShippingMethod(order.shippingMethod)?.name ?? order.shippingMethod,
    shippingFee: order.shippingFee,
    itemsTotal: order.itemsTotal,
    codAmount: order.codAmount,
    items: order.items.map((i) => ({
      sku: i.sku,
      productName: i.productName,
      size: i.size,
      color: i.color,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.unitPrice * i.quantity,
    })),
    timeline: buildTimeline(order.status),
  };
}

/** OD-06: the member's own orders, newest first, 10 per page. */
export async function listMemberOrders(memberId: string, page = 1): Promise<MemberOrderPage> {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const [total, orders] = await Promise.all([
    prisma.order.count({ where: { memberId } }),
    prisma.order.findMany({
      where: { memberId },
      orderBy: [{ createdAt: "desc" }, { code: "desc" }],
      skip: (safePage - 1) * ORDERS_PAGE_SIZE,
      take: ORDERS_PAGE_SIZE,
      include: { items: { select: { productName: true, quantity: true } } },
    }),
  ]);
  return {
    items: orders.map((o) => ({
      code: o.code,
      status: o.status,
      statusLabel: ORDER_STATUS_LABELS[o.status],
      createdAt: o.createdAt.toISOString(),
      codAmount: o.codAmount,
      itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
      firstItemName: o.items[0]?.productName ?? "",
    })),
    total,
    page: safePage,
    totalPages: Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE)),
  };
}

/** OD-05/OD-06: one order of the member; null when it does not exist or belongs to someone else. */
export async function getMemberOrder(memberId: string, code: string): Promise<OrderDetail | null> {
  const order = await prisma.order.findUnique({ where: { code }, include: { items: true } });
  return order && order.memberId === memberId ? toDetail(order) : null;
}

const lookupSchema = z.object({
  code: z
    .string({ error: "Vui lòng nhập mã đơn hàng" })
    .trim()
    .toUpperCase()
    .min(1, "Vui lòng nhập mã đơn hàng")
    .max(20, "Mã đơn hàng không hợp lệ"),
  email: emailSchema,
});

const ORDER_NOT_FOUND =
  "Không tìm thấy đơn. Vui lòng kiểm tra lại mã đơn và email đã dùng khi đặt hàng.";

/** OD-05: anyone with the order code and the email used to place it (guest or member). */
export async function lookupGuestOrder(input: unknown): Promise<OrderDetail> {
  const { code, email } = lookupSchema.parse(input);
  const order = await prisma.order.findUnique({ where: { code }, include: { items: true } });
  if (!order || order.customerEmail !== email) throw new AppError("NOT_FOUND", ORDER_NOT_FOUND);
  return toDetail(order);
}
