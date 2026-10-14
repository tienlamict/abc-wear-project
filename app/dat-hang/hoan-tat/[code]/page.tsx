import type { Metadata } from "next";
import Link from "next/link";
import { getSessionMemberId } from "@/lib/auth";
import { getLastOrderCode } from "@/lib/cart-session";
import { formatVnd } from "@/lib/money";
import { getOrderConfirmation } from "@/modules/order";

export const metadata: Metadata = { title: "Đặt hàng thành công" };

/** OD-04: order code and COD amount, for the buyer only. */
export default async function OrderCompletePage({ params }: { params: { code: string } }) {
  const code = decodeURIComponent(params.code);
  const order = await getOrderConfirmation(code, {
    memberId: await getSessionMemberId(),
    lastOrderCode: getLastOrderCode(),
  });

  if (!order) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-xl font-semibold">Không tìm thấy đơn</h1>
        <p className="mt-2 text-gray-600">
          Bạn có thể xem trạng thái đơn bằng mã đơn và email tại trang tra cứu.
        </p>
        <Link
          href="/tra-cuu-don"
          className="mt-6 inline-block rounded bg-gray-900 px-4 py-2 text-sm text-white"
        >
          Tra cứu đơn hàng
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg py-6 text-center">
      <p className="text-4xl" aria-hidden>
        ✓
      </p>
      <h1 className="mt-2 text-2xl font-bold">Đặt hàng thành công</h1>
      <p className="mt-2 text-gray-600">
        Cảm ơn {order.customerName}! Email xác nhận đã được gửi tới {order.customerEmail}.
      </p>

      <dl className="mt-6 space-y-2 rounded-lg border p-5 text-left text-sm">
        <div className="flex justify-between">
          <dt>Mã đơn hàng</dt>
          <dd data-testid="order-code" className="font-mono text-base font-semibold">
            {order.code}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>Tiền hàng ({order.itemCount} sản phẩm)</dt>
          <dd>{formatVnd(order.itemsTotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Phí giao hàng ({order.shippingMethodName})</dt>
          <dd>{formatVnd(order.shippingFee)}</dd>
        </div>
        <div className="flex justify-between border-t pt-2 text-base font-semibold">
          <dt>Thanh toán khi nhận hàng</dt>
          <dd data-testid="cod-amount">{formatVnd(order.codAmount)}</dd>
        </div>
      </dl>

      <p className="mt-4 text-sm text-gray-600">Hãy lưu mã đơn để tra cứu trạng thái giao hàng.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/tra-cuu-don" className="rounded border px-4 py-2 text-sm">
          Tra cứu đơn
        </Link>
        <Link href="/" className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white">
          Tiếp tục mua sắm
        </Link>
      </div>
    </div>
  );
}
