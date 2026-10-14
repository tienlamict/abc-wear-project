import { getOrCreateCartOwner } from "@/lib/cart-session";
import { toErrorResponse } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { addItem } from "@/modules/order";

/** OD-01: `{ sku, quantity }` (QT1, QT6, QT7). Issues the guest `sid` cookie if needed. */
export async function POST(req: Request): Promise<Response> {
  try {
    const body = await readJson(req);
    return Response.json(await addItem(await getOrCreateCartOwner(), body));
  } catch (err) {
    return toErrorResponse(err);
  }
}
