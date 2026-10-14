import { setSessionCookie } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { register } from "@/modules/member";

/** MA-01: creates the account and signs the member in. */
export async function POST(req: Request): Promise<Response> {
  try {
    const member = await register(await readJson(req));
    await setSessionCookie(member.id);
    return Response.json({ member }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
