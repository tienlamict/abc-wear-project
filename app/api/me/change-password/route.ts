import { requireMemberId } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { changePassword } from "@/modules/member";

/** MA-03: `{ currentPassword, newPassword }` */
export async function POST(req: Request): Promise<Response> {
  try {
    await changePassword(await requireMemberId(), await readJson(req));
    return Response.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
