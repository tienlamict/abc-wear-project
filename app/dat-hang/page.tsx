import type { Metadata } from "next";
import Link from "next/link";
import { Checkout } from "@/components/checkout/Checkout";
import { getCartOwner } from "@/lib/cart-session";
import { getCart, listShippingMethods } from "@/modules/order";
import { getCurrentMemberCached } from "../_lib/auth";

export const metadata: Metadata = { title: "Đặt hàng" };

/** OD-02, OD-03: no sign-in needed; a member gets their default address filled in. */
export default async function CheckoutPage() {
  const [cart, member] = await Promise.all([
    getCartOwner().then(getCart),
    getCurrentMemberCached(),
  ]);

  if (cart.lines.length === 0 || cart.hasProblems) {
    return (
      <div className="py-10 text-center">
        <h1 className="text-2xl font-bold">Đặt hàng</h1>
        <p className="mt-3 text-gray-600">
          {cart.lines.length === 0
            ? "Giỏ hàng đang trống. Hãy chọn sản phẩm trước khi đặt hàng."
            : "Một số sản phẩm trong giỏ tạm hết hàng hoặc không đủ số lượng. Vui lòng kiểm tra lại giỏ hàng."}
        </p>
        <Link
          href={cart.lines.length === 0 ? "/" : "/gio-hang"}
          className="mt-6 inline-block rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          {cart.lines.length === 0 ? "Tiếp tục mua sắm" : "Về giỏ hàng"}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Đặt hàng</h1>
      <p className="mb-6 text-sm text-gray-600">
        Thanh toán khi nhận hàng (COD).{" "}
        {member ? (
          "Thông tin được điền sẵn từ tài khoản của bạn."
        ) : (
          <>
            Không cần tài khoản —{" "}
            <Link href="/dang-nhap?next=/dat-hang" className="underline">
              đăng nhập
            </Link>{" "}
            để điền sẵn địa chỉ.
          </>
        )}
      </p>
      <Checkout
        cart={cart}
        methods={listShippingMethods()}
        defaults={{
          customerName: member?.fullName ?? "",
          customerEmail: member?.email ?? "",
          customerPhone: member?.phone ?? "",
          shipLine1: member?.shipLine1 ?? "",
          shipWard: member?.shipWard ?? "",
          shipDistrict: member?.shipDistrict ?? "",
          shipProvince: member?.shipProvince ?? "",
        }}
      />
    </div>
  );
}
