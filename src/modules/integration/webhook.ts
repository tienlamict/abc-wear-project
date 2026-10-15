import { createHash, timingSafeEqual } from "node:crypto";
import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { writeSyncLog } from "./sync-log";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * IF-05: Main System authenticates with the shared `x-main-secret` header (spec §15: no HMAC).
 * Compared in constant time; a mismatch is logged and rejected with 401.
 */
export async function verifyMainSecret(header: string | null): Promise<void> {
  const expected = getConfig().MAIN_WEBHOOK_SECRET;
  if (header && timingSafeEqual(digest(header), digest(expected))) return;
  await writeSyncLog({
    direction: "IN",
    iface: "IF-05",
    result: "ERROR",
    message: header ? "rejected: wrong x-main-secret" : "rejected: missing x-main-secret",
  });
  throw new AppError("UNAUTHORIZED", "Sai hoặc thiếu x-main-secret.");
}
