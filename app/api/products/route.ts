import type { NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/errors";
import { listProducts, parseProductFilters } from "@/modules/catalog";

export const dynamic = "force-dynamic";

/** PS-01, PS-02, PS-03: `?q&category&size&color&minPrice&maxPrice&sort&page` */
export async function GET(req: NextRequest): Promise<Response> {
  try {
    const filters = parseProductFilters(req.nextUrl.searchParams);
    return Response.json(await listProducts(filters));
  } catch (err) {
    return toErrorResponse(err);
  }
}
