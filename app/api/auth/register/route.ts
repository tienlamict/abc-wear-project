import { setSessionCookie } from "@/lib/auth";
import { getGuestSessionId } from "@/lib/cart-session";
import { toErrorResponse } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { register } from "@/modules/member";
import { mergeGuestCart } from "@/modules/order";

/** MA-01: creates the account and signs the member in, keeping the guest cart (QT10). */
export async function POST(req: Request): Promise<Response> {
  try {
    const member = await register(await readJson(req));
    await setSessionCookie(member.id);
    const sid = getGuestSessionId();
    if (sid) await mergeGuestCart(sid, member.id);
    return Response.json({ member }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
