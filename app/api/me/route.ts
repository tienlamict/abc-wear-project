import { requireMemberId } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { getProfile, updateProfile } from "@/modules/member";

export const dynamic = "force-dynamic";

/** MA-04 */
export async function GET(): Promise<Response> {
  try {
    return Response.json({ member: await getProfile(await requireMemberId()) });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** MA-04: `{ fullName?, phone?, shipLine1?, shipWard?, shipDistrict?, shipProvince? }` */
export async function PATCH(req: Request): Promise<Response> {
  try {
    const memberId = await requireMemberId();
    return Response.json({ member: await updateProfile(memberId, await readJson(req)) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
