import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { getSessionMemberId } from "@/lib/auth";
import { formatDateTime } from "@/lib/format-date";
import { formatVnd } from "@/lib/money";
import { listMemberOrders } from "@/modules/order";

export const metadata: Metadata = { title: "Đơn hàng của tôi" };

/** OD-06: the member's orders, newest first. */
export default async function MyOrdersPage({
  searchParams,
}: {
  searchParams: { page?: string | string[] };
}) {
  const memberId = await getSessionMemberId();
  if (!memberId) redirect("/dang-nhap?next=/tai-khoan/don-hang");
  const page = Number(typeof searchParams.page === "string" ? searchParams.page : 1) || 1;
  const orders = await listMemberOrders(memberId, page);

  if (orders.total === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <p className="font-medium">Bạn chưa có đơn hàng nào.</p>
        <Link
          href="/"
          className="mt-4 inline-block rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          Bắt đầu mua sắm
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Đơn hàng của tôi</h1>
      <ul aria-label="Danh sách đơn hàng" className="divide-y rounded-lg border">
        {orders.items.map((o) => (
          <li key={o.code} data-testid="order-row" data-code={o.code}>
            <Link
              href={`/tai-khoan/don-hang/${o.code}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 hover:bg-gray-50"
            >
              <span className="font-mono font-semibold">{o.code}</span>
              <OrderStatusBadge status={o.status} />
              <span className="text-sm text-gray-600">{formatDateTime(o.createdAt)}</span>
              <span className="w-full text-sm text-gray-700 sm:w-auto sm:flex-1">
                {o.firstItemName}
                {o.itemCount > 1 && ` và ${o.itemCount - 1} sản phẩm khác`}
              </span>
              <span className="font-semibold">{formatVnd(o.codAmount)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {orders.totalPages > 1 && (
        <nav aria-label="Phân trang" className="mt-6 flex justify-center gap-3 text-sm">
          {orders.page > 1 && (
            <Link
              href={`/tai-khoan/don-hang?page=${orders.page - 1}`}
              className="rounded border px-3 py-1.5"
            >
              ‹ Trước
            </Link>
          )}
          <span className="px-3 py-1.5 text-gray-600">
            Trang {orders.page}/{orders.totalPages}
          </span>
          {orders.page < orders.totalPages && (
            <Link
              href={`/tai-khoan/don-hang?page=${orders.page + 1}`}
              className="rounded border px-3 py-1.5"
            >
              Sau ›
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
