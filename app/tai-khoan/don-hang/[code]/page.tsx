import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderDetailView } from "@/components/orders/OrderDetailView";
import { getSessionMemberId } from "@/lib/auth";
import { getMemberOrderCached } from "../../../_lib/orders";

export function generateMetadata({ params }: { params: { code: string } }): Metadata {
  return { title: `Đơn ${params.code}` };
}

/** OD-05/OD-06: one of the member's orders with its status timeline. */
export default async function MemberOrderPage({ params }: { params: { code: string } }) {
  const memberId = await getSessionMemberId();
  const order = memberId && (await getMemberOrderCached(memberId, params.code));
  if (!order) notFound();

  return (
    <div>
      <Link
        href="/tai-khoan/don-hang"
        className="mb-4 inline-block text-sm text-gray-600 underline"
      >
        ‹ Tất cả đơn hàng
      </Link>
      <h1 className="mb-4 text-2xl font-bold">Chi tiết đơn hàng</h1>
      <OrderDetailView order={order} />
    </div>
  );
}
