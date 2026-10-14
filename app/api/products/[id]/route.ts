import { AppError, toErrorResponse } from "@/lib/errors";
import { getProduct } from "@/modules/catalog";

export const dynamic = "force-dynamic";

/** PS-04 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  try {
    const product = await getProduct(params.id);
    if (!product) throw new AppError("NOT_FOUND", "Không tìm thấy sản phẩm.");
    return Response.json(product);
  } catch (err) {
    return toErrorResponse(err);
  }
}
