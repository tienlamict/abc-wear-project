import type { Metadata } from "next";
import { CartPanel } from "@/components/cart/CartPanel";
import { getCartOwner } from "@/lib/cart-session";
import { getCart } from "@/modules/order";

export const metadata: Metadata = { title: "Giỏ hàng" };

/** OD-01 */
export default async function CartPage() {
  const cart = await getCart(await getCartOwner());
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Giỏ hàng</h1>
      <CartPanel initialCart={cart} />
    </div>
  );
}
