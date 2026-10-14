import { setSessionCookie } from "@/lib/auth";
import { getGuestSessionId } from "@/lib/cart-session";
import { toErrorResponse } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { login } from "@/modules/member";
import { mergeGuestCart } from "@/modules/order";

/** MA-02 (QT9 lockout inside login()); then QT10: the guest cart joins the member cart. */
export async function POST(req: Request): Promise<Response> {
  try {
    const member = await login(await readJson(req));
    await setSessionCookie(member.id);
    const sid = getGuestSessionId();
    if (sid) await mergeGuestCart(sid, member.id);
    return Response.json({ member });
  } catch (err) {
    return toErrorResponse(err);
  }
}
