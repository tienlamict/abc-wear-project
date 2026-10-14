import { getCartOwner } from "@/lib/cart-session";
import { toErrorResponse } from "@/lib/errors";
import { getCart } from "@/modules/order";

export const dynamic = "force-dynamic";

/** OD-01 */
export async function GET(): Promise<Response> {
  try {
    return Response.json(await getCart(await getCartOwner()));
  } catch (err) {
    return toErrorResponse(err);
  }
}
