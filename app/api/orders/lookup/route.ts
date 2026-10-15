import { toErrorResponse } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { lookupGuestOrder } from "@/modules/order";

/** OD-05: `{ code, email }` → the order, or 404 "Không tìm thấy đơn". */
export async function POST(req: Request): Promise<Response> {
  try {
    return Response.json(await lookupGuestOrder(await readJson(req)));
  } catch (err) {
    return toErrorResponse(err);
  }
}
