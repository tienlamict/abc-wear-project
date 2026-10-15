import type { OrderStatus } from "@prisma/client";
import { ORDER_STATUS_LABELS } from "@/lib/order-state";

const TONE: Record<OrderStatus, string> = {
  CONFIRMED: "bg-gray-100 text-gray-800",
  SENT_TO_MAIN: "bg-sky-100 text-sky-800",
  PICKING: "bg-amber-100 text-amber-800",
  SHIPPING: "bg-indigo-100 text-indigo-800",
  DELIVERED: "bg-emerald-100 text-emerald-800",
  DELIVERY_FAILED: "bg-red-100 text-red-800",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      data-testid="order-status"
      data-status={status}
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${TONE[status]}`}
    >
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
