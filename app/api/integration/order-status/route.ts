import { toErrorResponse } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { verifyMainSecret } from "@/modules/integration";
import { applyStatusUpdate } from "@/modules/order";

/**
 * IF-05 webhook from Main System: `{ mainOrderId, status, trackingNumber? }` with the
 * `x-main-secret` header. 200 `{ result, code, status }` for changed, repeated (ignored) and
 * invalid (ignored, logged) updates; 401 bad secret; 400 bad payload; 404 unknown order.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    await verifyMainSecret(req.headers.get("x-main-secret"));
    return Response.json(await applyStatusUpdate(await readJson(req)));
  } catch (err) {
    return toErrorResponse(err);
  }
}
