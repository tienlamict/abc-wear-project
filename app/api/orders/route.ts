import type { NextRequest } from "next/server";
import { getSessionMemberId, requireMemberId } from "@/lib/auth";
import { getCartOwner, rememberLastOrder } from "@/lib/cart-session";
import { toErrorResponse } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { listMemberOrders, placeOrder } from "@/modules/order";

export const dynamic = "force-dynamic";

/** OD-06: the signed-in member's orders, newest first (`?page=`, 10 per page). */
export async function GET(req: NextRequest): Promise<Response> {
  try {
    const memberId = await requireMemberId();
    const page = Number(req.nextUrl.searchParams.get("page") ?? 1);
    return Response.json(await listMemberOrders(memberId, page));
  } catch (err) {
    return toErrorResponse(err);
  }
}

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
