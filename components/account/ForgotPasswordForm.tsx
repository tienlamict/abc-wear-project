"use client";

import type { FormEvent } from "react";
import { FormMessage, SubmitButton, TextField, callApi, formValues, useFormState } from "../form";

/** MA-03: always the same answer, registered email or not. */
export function ForgotPasswordForm() {
  const { pending, setPending, error, setError, success, setSuccess } = useFormState();

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);
    const result = await callApi("/api/auth/forgot-password", formValues(e.currentTarget));
    if (result.ok) {
      setSuccess(
        "Nếu email đã đăng ký, bạn sẽ nhận được liên kết đặt lại mật khẩu trong vài phút. Liên kết có hiệu lực 30 phút.",
      );
    } else {
      setError(result.error);
    }
    setPending(false);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Quên mật khẩu">
      <FormMessage error={error?.message} success={success} />
      <TextField
        label="Email đã đăng ký"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={error?.fields.email}
      />
      <SubmitButton pending={pending}>Gửi liên kết đặt lại</SubmitButton>
    </form>
  );
}
