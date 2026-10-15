const VN_DATE_TIME = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** `14:30 15/10/2026` (vi-VN) in Vietnam time, whatever the server or browser time zone. */
export function formatDateTime(value: Date | string): string {
  return VN_DATE_TIME.format(typeof value === "string" ? new Date(value) : value);
}
