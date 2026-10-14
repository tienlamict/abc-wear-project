import { setSessionCookie } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { login } from "@/modules/member";

/** MA-02 (QT9 lockout inside login()). Guest cart merge (QT10) is added with the cart in M4. */
export async function POST(req: Request): Promise<Response> {
  try {
    const member = await login(await readJson(req));
    await setSessionCookie(member.id);
    return Response.json({ member });
  } catch (err) {
    return toErrorResponse(err);
  }
}
