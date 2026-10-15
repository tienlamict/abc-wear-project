import type { OrderStatus } from "@prisma/client";

const NEXT: Record<OrderStatus, readonly OrderStatus[]> = {
  CONFIRMED: ["SENT_TO_MAIN"],
  SENT_TO_MAIN: ["PICKING"],
  PICKING: ["SHIPPING"],
  SHIPPING: ["DELIVERED", "DELIVERY_FAILED"],
  DELIVERED: [],
  DELIVERY_FAILED: [],
};

export type TransitionResult =
  | { kind: "changed"; status: OrderStatus }
  | { kind: "unchanged"; status: OrderStatus } // repeated update, safe to ignore
  | { kind: "invalid"; status: OrderStatus; reason: string };

/**
 * CONFIRMED → SENT_TO_MAIN → PICKING → SHIPPING → DELIVERED, and SHIPPING → DELIVERY_FAILED.
 * Invalid moves keep the current status; callers ignore them and log an ERROR.
 */
export function transition(from: OrderStatus, to: OrderStatus): TransitionResult {
  if (from === to) return { kind: "unchanged", status: from };
  if (NEXT[from].includes(to)) return { kind: "changed", status: to };
  return { kind: "invalid", status: from, reason: `cannot move order from ${from} to ${to}` };
}

/** Customer-facing Vietnamese names of each status. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  CONFIRMED: "Đã xác nhận",
  SENT_TO_MAIN: "Đã chuyển kho",
  PICKING: "Đang chuẩn bị hàng",
  SHIPPING: "Đang giao hàng",
  DELIVERED: "Đã giao hàng",
  DELIVERY_FAILED: "Giao không thành công",
};

/** The normal path in order; DELIVERY_FAILED takes DELIVERED's place when delivery fails. */
export const ORDER_PROGRESS: readonly OrderStatus[] = [
  "CONFIRMED",
  "SENT_TO_MAIN",
  "PICKING",
  "SHIPPING",
  "DELIVERED",
];
