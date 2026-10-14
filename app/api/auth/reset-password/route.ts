import { toErrorResponse } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { resetPassword } from "@/modules/member";

/** MA-03: `{ token, password }` */
export async function POST(req: Request): Promise<Response> {
  try {
    await resetPassword(await readJson(req));
    return Response.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
