import { getSessionMemberId } from "@/lib/auth";
import { getCartOwner, rememberLastOrder } from "@/lib/cart-session";
import { toErrorResponse } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { placeOrder } from "@/modules/order";

/**
 * OD-02, OD-03: places a COD order from the current cart. Requires an `Idempotency-Key`
 * header (QT8): 201 for a new order, 200 with the same body when the key was already used.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const result = await placeOrder({
      owner: await getCartOwner(),
      memberId: await getSessionMemberId(),
      idempotencyKey: req.headers.get("idempotency-key"),
      input: await readJson(req),
    });
    rememberLastOrder(result.code);
    return Response.json(
      { code: result.code, codAmount: result.codAmount },
      { status: result.created ? 201 : 200 },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
