import { ZodError, z } from "zod";

// Field-level validation messages default to Vietnamese wherever errors reach the API.
z.config(z.locales.vi());

export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  ACCOUNT_LOCKED: 423,
  EMAIL_TAKEN: 409,
  TOKEN_INVALID: 400,
  CART_EMPTY: 400,
  OUT_OF_STOCK: 409,
  NOT_PURCHASABLE: 409,
  MAIN_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

/** Default Vietnamese messages telling the customer what to do next. */
const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại các trường được đánh dấu.",
  UNAUTHORIZED: "Vui lòng đăng nhập để tiếp tục.",
  NOT_FOUND: "Không tìm thấy nội dung bạn yêu cầu.",
  ACCOUNT_LOCKED:
    "Tài khoản tạm khóa do nhập sai mật khẩu nhiều lần. Vui lòng thử lại sau 15 phút.",
  EMAIL_TAKEN: "Email này đã được đăng ký. Vui lòng đăng nhập hoặc dùng email khác.",
  TOKEN_INVALID: "Liên kết không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu liên kết mới.",
  CART_EMPTY: "Giỏ hàng đang trống. Vui lòng thêm sản phẩm trước khi đặt hàng.",
  OUT_OF_STOCK: "Một số sản phẩm không đủ hàng. Vui lòng giảm số lượng hoặc bỏ sản phẩm đó.",
  NOT_PURCHASABLE: "Một số sản phẩm tạm hết hàng. Vui lòng bỏ sản phẩm đó khỏi giỏ.",
  MAIN_UNAVAILABLE: "Hệ thống đang bận, chưa thể đặt hàng. Vui lòng thử lại sau ít phút.",
  INTERNAL_ERROR: "Đã có lỗi xảy ra. Vui lòng thử lại sau.",
};

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string = DEFAULT_MESSAGES[code],
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }

  get status(): number {
    return ERROR_STATUS[this.code];
  }
}

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

function fromZod(err: ZodError): AppError {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  return new AppError("VALIDATION_ERROR", undefined, { fields });
}

/** Converts any thrown value into the API error shape `{ error: { code, message } }`. */
export function toErrorResponse(err: unknown): Response {
  let appError: AppError;
  if (err instanceof AppError) appError = err;
  else if (err instanceof ZodError) appError = fromZod(err);
  else {
    console.error("[api] unexpected error", err);
    appError = new AppError("INTERNAL_ERROR");
  }

  const body: ErrorBody = { error: { code: appError.code, message: appError.message } };
  if (appError.details !== undefined) body.error.details = appError.details;
  return Response.json(body, { status: appError.status });
}
