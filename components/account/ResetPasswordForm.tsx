"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { FormMessage, SubmitButton, TextField, callApi, formValues, useFormState } from "../form";
import { mismatchError } from "./mismatch";

/** MA-03: new password from the emailed link. */
export function ResetPasswordForm({ token }: { token: string }) {
  const { pending, setPending, error, setError, success, setSuccess } = useFormState();

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { password, confirmPassword } = formValues(e.currentTarget);
    if (password !== confirmPassword) {
      setError(mismatchError("confirmPassword"));
      return;
    }
    setPending(true);
    setError(null);
    const result = await callApi("/api/auth/reset-password", { token, password });
    if (result.ok) setSuccess("Đã đặt mật khẩu mới. Bạn có thể đăng nhập bằng mật khẩu này.");
    else setError(result.error);
    setPending(false);
  };

  if (success)
    return (
      <div className="space-y-4">
        <FormMessage success={success} />
        <Link
          href="/dang-nhap"
          className="block rounded bg-gray-900 px-4 py-2.5 text-center text-sm font-medium text-white"
        >
          Đăng nhập
        </Link>
      </div>
    );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Đặt lại mật khẩu">
      <FormMessage error={error?.message} />
      {error?.code === "TOKEN_INVALID" && (
        <p className="text-sm">
          <Link href="/quen-mat-khau" className="underline">
            Yêu cầu liên kết mới
          </Link>
        </p>
      )}
      <TextField
        label="Mật khẩu mới"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="Ít nhất 8 ký tự"
        error={error?.fields.password}
      />
      <TextField
        label="Nhập lại mật khẩu mới"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={error?.fields.confirmPassword}
      />
      <SubmitButton pending={pending}>Đặt mật khẩu mới</SubmitButton>
    </form>
  );
}
