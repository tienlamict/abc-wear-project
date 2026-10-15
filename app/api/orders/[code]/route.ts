import { requireMemberId } from "@/lib/auth";
import { AppError, toErrorResponse } from "@/lib/errors";
import { getMemberOrder } from "@/modules/order";

export const dynamic = "force-dynamic";

/** OD-05/OD-06: one of the member's orders. Someone else's order is reported as not found. */
export async function GET(
  _req: Request,
  { params }: { params: { code: string } },
): Promise<Response> {
  try {
    const order = await getMemberOrder(await requireMemberId(), params.code);
    if (!order) throw new AppError("NOT_FOUND", "Không tìm thấy đơn.");
    return Response.json(order);
  } catch (err) {
    return toErrorResponse(err);
  }
}
