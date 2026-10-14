/** Only same-site relative paths, so `?next=` cannot send people to another site. */
export function safeNextPath(next: unknown, fallback = "/tai-khoan"): string {
  if (typeof next !== "string" || !next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\") || /[\r\n]/.test(next)) return fallback;
  return next;
}
