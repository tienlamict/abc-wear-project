import type { Metadata } from "next";
import Link from "next/link";
import { OrderLookup } from "@/components/orders/OrderLookup";
import { getCurrentMemberCached } from "../_lib/auth";

export const metadata: Metadata = { title: "Tra cứu đơn hàng" };

/** OD-05: anyone can check an order with its code and the email used to place it. */
export default async function OrderLookupPage({
  searchParams,
}: {
  searchParams: { code?: string | string[] };
}) {
  const member = await getCurrentMemberCached();
  return (
    <div>
      <h1 className="text-2xl font-bold">Tra cứu đơn hàng</h1>
      <p className="mb-6 mt-2 text-sm text-gray-600">
        Nhập mã đơn (trong email xác nhận) và email bạn đã dùng khi đặt hàng.
        {member && (
          <>
            {" "}
            Đơn của tài khoản bạn có trong{" "}
            <Link href="/tai-khoan/don-hang" className="underline">
              Đơn hàng của tôi
            </Link>
            .
          </>
        )}
      </p>
      <OrderLookup
        defaultCode={typeof searchParams.code === "string" ? searchParams.code : ""}
        defaultEmail={member?.email ?? ""}
      />
    </div>
  );
}
