import { revalidatePath } from "next/cache";
import { toErrorResponse } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { catalogChangedSchema, syncOnCatalogChange, verifyMainSecret } from "@/modules/integration";

/**
 * Main System asks for a sync right after its data changed (spec §9.3): `{ type: "catalog" |
 * "stock" }` with the `x-main-secret` header. "catalog" runs IF-01 then IF-02, "stock" IF-02.
 * 200 `{ synced, products, variants, durationMs }`; 401 bad secret; 400 bad payload;
 * 502 when the sync itself failed (Main shows the message on its admin page).
 */
export async function POST(req: Request): Promise<Response> {
  try {
    await verifyMainSecret(req.headers.get("x-main-secret"), "IF-01");
    const body = catalogChangedSchema.parse(await readJson(req));
    const result = await syncOnCatalogChange(body.type);
    revalidatePath("/", "layout");
    return Response.json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
