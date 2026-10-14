import { getCartOwner } from "@/lib/cart-session";
import { AppError, toErrorResponse } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { removeItem, updateItem } from "@/modules/order";

interface Context {
  params: { sku: string };
}

async function requireOwner() {
  const owner = await getCartOwner();
  if (!owner) throw new AppError("NOT_FOUND", "Sản phẩm không có trong giỏ hàng.");
  return owner;
}

/** OD-01: `{ quantity }` */
export async function PATCH(req: Request, { params }: Context): Promise<Response> {
  try {
    const body = await readJson(req);
    return Response.json(await updateItem(await requireOwner(), params.sku, body));
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** OD-01 */
export async function DELETE(_req: Request, { params }: Context): Promise<Response> {
  try {
    return Response.json(await removeItem(await requireOwner(), params.sku));
  } catch (err) {
    return toErrorResponse(err);
  }
}
