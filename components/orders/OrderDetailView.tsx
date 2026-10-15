import { formatDateTime } from "@/lib/format-date";
import { formatVnd } from "@/lib/money";
import type { OrderDetail, TimelineStep } from "@/modules/order/queries";
import { OrderStatusBadge } from "./OrderStatusBadge";

const DOT: Record<TimelineStep["state"], string> = {
  done: "border-gray-900 bg-gray-900 text-white",
  current: "border-gray-900 bg-white text-gray-900 ring-4 ring-gray-200",
  failed: "border-red-600 bg-red-600 text-white",
  upcoming: "border-gray-300 bg-white text-gray-300",
};

function Timeline({ order }: { order: OrderDetail }) {
  return (
    <ol aria-label="Dòng thời gian trạng thái" className="space-y-0">
      {order.timeline.map((step, i) => {
        const last = i === order.timeline.length - 1;
        const time =
          step.status === "CONFIRMED"
            ? order.createdAt
            : step.state === "current" || step.state === "failed"
              ? order.updatedAt
              : null;
        return (
          <li
            key={step.status}
            data-testid="timeline-step"
            data-state={step.state}
            aria-current={step.state === "current" || step.state === "failed" ? "step" : undefined}
            className="relative flex gap-3 pb-5"
          >
            {!last && (
              <span
                aria-hidden
                className={`absolute left-[11px] top-6 h-full w-0.5 ${
                  step.state === "done" ? "bg-gray-900" : "bg-gray-200"
                }`}
              />
            )}
            <span
              aria-hidden
              className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs ${DOT[step.state]}`}
            >
              {step.state === "done" ? "✓" : step.state === "failed" ? "!" : ""}
            </span>
            <div className="text-sm">
              <p
                className={
                  step.state === "upcoming"
                    ? "text-gray-400"
                    : step.state === "failed"
                      ? "font-semibold text-red-700"
                      : "font-medium"
                }
              >
                {step.label}
              </p>
              {time && <p className="text-xs text-gray-500">{formatDateTime(time)}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** OD-05/OD-06: one order, used by the member's order page and the guest lookup page. */
export function OrderDetailView({ order }: { order: OrderDetail }) {
  return (
    <article aria-label={`Đơn hàng ${order.code}`} className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="font-mono text-xl font-semibold" data-testid="detail-code">
          {order.code}
        </h2>
        <OrderStatusBadge status={order.status} />
        <p className="w-full text-sm text-gray-600">Đặt lúc {formatDateTime(order.createdAt)}</p>
      </header>

      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        <section aria-label="Trạng thái" className="rounded-lg border p-4">
          <Timeline order={order} />
          {order.trackingNumber && (
            <p className="border-t pt-3 text-sm">
              Mã vận đơn:{" "}
              <span data-testid="tracking-number" className="font-mono font-semibold">
                {order.trackingNumber}
              </span>
            </p>
          )}
          {order.status === "DELIVERY_FAILED" && (
            <p className="mt-3 text-sm text-red-700">
              Đơn vị vận chuyển chưa giao được hàng. ABC Wear sẽ liên hệ với bạn qua số{" "}
              {order.customerPhone}.
            </p>
          )}
        </section>

        <div className="space-y-6">
          <section aria-label="Sản phẩm đã đặt">
            <ul className="divide-y rounded-lg border text-sm">
              {order.items.map((item) => (
                <li key={item.sku} className="flex justify-between gap-3 p-3">
                  <span>
                    {item.productName}
                    <span className="block text-gray-600">
                      {item.color} · Size {item.size} · {formatVnd(item.unitPrice)} ×{" "}
                      {item.quantity}
                    </span>
                  </span>
                  <span className="whitespace-nowrap">{formatVnd(item.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt>Tiền hàng</dt>
                <dd>{formatVnd(order.itemsTotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Phí giao hàng ({order.shippingMethodName})</dt>
                <dd>{formatVnd(order.shippingFee)}</dd>
              </div>
              <div className="flex justify-between border-t pt-1 text-base font-semibold">
                <dt>Thanh toán khi nhận hàng (COD)</dt>
                <dd>{formatVnd(order.codAmount)}</dd>
              </div>
            </dl>
          </section>

          <section aria-label="Giao đến" className="text-sm">
            <h3 className="mb-1 font-semibold">Giao đến</h3>
            <p>
              {order.customerName} · {order.customerPhone}
            </p>
            <p>
              {order.shipLine1}, {order.shipWard}, {order.shipDistrict}, {order.shipProvince}
            </p>
          </section>
        </div>
      </div>
    </article>
  );
}
