import { z } from "zod";

// Field rules shared by the member and order modules (Vietnamese messages).

export const emailSchema = z
  .string({ error: "Vui lòng nhập email" })
  .trim()
  .toLowerCase()
  .min(1, "Vui lòng nhập email")
  .max(191, "Email quá dài")
  .pipe(z.email("Email không hợp lệ"));

export const fullNameSchema = z
  .string({ error: "Vui lòng nhập họ tên" })
  .trim()
  .min(1, "Vui lòng nhập họ tên")
  .max(191, "Họ tên quá dài");

const PHONE_MESSAGE = "Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0)";
const normalizePhone = (v: string) => v.replace(/[\s.-]/g, "");

/** Vietnamese phone: 10 digits starting with 0, or +84 followed by 9 digits. */
export const isVnPhone = (v: string) => /^(0|\+84)\d{9}$/.test(normalizePhone(v));

export const requiredPhoneSchema = z
  .string({ error: "Vui lòng nhập số điện thoại" })
  .transform(normalizePhone)
  .refine((v) => v !== "", { error: "Vui lòng nhập số điện thoại" })
  .refine((v) => v === "" || isVnPhone(v), { error: PHONE_MESSAGE });

/** Empty or missing → null. */
export const optionalPhoneSchema = z
  .string()
  .nullish()
  .transform((v) => normalizePhone(v ?? ""))
  .refine((v) => v === "" || isVnPhone(v), { error: PHONE_MESSAGE })
  .transform((v) => (v === "" ? null : v));

/** Required trimmed text with a Vietnamese label, e.g. requiredText(100, "Phường/Xã"). */
export const requiredText = (max: number, label: string) =>
  z
    .string({ error: `Vui lòng nhập ${label.toLowerCase()}` })
    .trim()
    .min(1, `Vui lòng nhập ${label.toLowerCase()}`)
    .max(max, `${label} quá dài`);

/** Optional trimmed text; empty or missing → null. */
export const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} quá dài`)
    .nullish()
    .transform((v) => (v ? v : null));
