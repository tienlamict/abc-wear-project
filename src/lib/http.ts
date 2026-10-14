import { AppError } from "./errors";

/** Request body as JSON; a missing or malformed body is a VALIDATION_ERROR, not a 500. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  throw new AppError("VALIDATION_ERROR", "Dữ liệu gửi lên không hợp lệ. Vui lòng thử lại.");
}
