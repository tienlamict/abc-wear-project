import { z } from "zod";
import {
  emailSchema,
  fullNameSchema,
  optionalPhoneSchema as phoneSchema,
  optionalText,
} from "@/lib/validation";

export const newPasswordSchema = z
  .string({ error: "Vui lòng nhập mật khẩu" })
  .min(8, "Mật khẩu cần ít nhất 8 ký tự")
  .max(72, "Mật khẩu tối đa 72 ký tự");

export const registerSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
  fullName: fullNameSchema,
  phone: phoneSchema.optional(),
});
export type RegisterInput = z.input<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: "Vui lòng nhập mật khẩu" }).min(1, "Vui lòng nhập mật khẩu"),
});
export type LoginInput = z.input<typeof loginSchema>;

/** PATCH semantics: missing fields stay unchanged; empty optional fields are cleared. */
export const profileSchema = z
  .object({
    fullName: fullNameSchema,
    phone: phoneSchema,
    shipLine1: optionalText(255, "Địa chỉ"),
    shipWard: optionalText(100, "Phường/Xã"),
    shipDistrict: optionalText(100, "Quận/Huyện"),
    shipProvince: optionalText(100, "Tỉnh/Thành phố"),
  })
  .partial();
export type ProfileInput = z.input<typeof profileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z
    .string({ error: "Vui lòng nhập mật khẩu hiện tại" })
    .min(1, "Vui lòng nhập mật khẩu hiện tại"),
  newPassword: newPasswordSchema,
});
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string({ error: "Thiếu mã đặt lại mật khẩu" }).min(1, "Thiếu mã đặt lại mật khẩu"),
  password: newPasswordSchema,
});
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;
