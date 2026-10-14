import { toErrorResponse } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { requestPasswordReset } from "@/modules/member";

/** MA-03: same answer whether or not the email is registered. */
export async function POST(req: Request): Promise<Response> {
  try {
    await requestPasswordReset(await readJson(req));
    return Response.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
