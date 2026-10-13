import { randomInt } from "node:crypto";

// No 0/O/1/I so codes read back unambiguously over the phone.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Ho_Chi_Minh, no DST

export const ORDER_CODE_PATTERN = /^ABC-\d{6}-[2-9A-HJ-NP-Z]{5}$/;

/** `ABC-YYMMDD-XXXXX`, date in Vietnam time. */
export function generateOrderCode(
  now: Date = new Date(),
  random: (max: number) => number = randomInt,
): string {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const yymmdd =
    String(vn.getUTCFullYear() % 100).padStart(2, "0") +
    String(vn.getUTCMonth() + 1).padStart(2, "0") +
    String(vn.getUTCDate()).padStart(2, "0");
  let suffix = "";
  for (let i = 0; i < 5; i++) suffix += ALPHABET[random(ALPHABET.length)];
  return `ABC-${yymmdd}-${suffix}`;
}

export function isOrderCode(value: string): boolean {
  return ORDER_CODE_PATTERN.test(value);
}
