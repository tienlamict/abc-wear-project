import { toErrorResponse } from "@/lib/errors";
import { getCategoryTree } from "@/modules/catalog";

export const dynamic = "force-dynamic";

/** PS-03 */
export async function GET(): Promise<Response> {
  try {
    return Response.json({ categories: await getCategoryTree() });
  } catch (err) {
    return toErrorResponse(err);
  }
}
