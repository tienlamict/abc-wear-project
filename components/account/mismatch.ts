import type { ApiFailure } from "../form";

/** Client-side check before submitting: the two password fields differ. */
export function mismatchError(field: string): ApiFailure {
  return {
    code: "VALIDATION_ERROR",
    message: "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại các trường được đánh dấu.",
    fields: { [field]: "Mật khẩu nhập lại không khớp" },
  };
}
