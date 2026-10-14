"use client";

import type { FormEvent } from "react";
import { FormMessage, SubmitButton, TextField, callApi, formValues, useFormState } from "../form";
import { mismatchError } from "./mismatch";

/** MA-03: needs the current password. */
export function ChangePasswordForm() {
  const { pending, setPending, error, setError, success, setSuccess } = useFormState();

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const { currentPassword, newPassword, confirmPassword } = formValues(form);
    setSuccess(null);
    if (newPassword !== confirmPassword) {
      setError(mismatchError("confirmPassword"));
      return;
    }
    setPending(true);
    setError(null);
    const result = await callApi("/api/me/change-password", { currentPassword, newPassword });
    if (result.ok) {
      setSuccess("Đã đổi mật khẩu.");
      form.reset();
    } else {
      setError(result.error);
    }
    setPending(false);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Đổi mật khẩu">
      <FormMessage error={error?.message} success={success} />
      <TextField
        label="Mật khẩu hiện tại"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        error={error?.fields.currentPassword}
      />
      <TextField
        label="Mật khẩu mới"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        hint="Ít nhất 8 ký tự"
        error={error?.fields.newPassword}
      />
      <TextField
        label="Nhập lại mật khẩu mới"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={error?.fields.confirmPassword}
      />
      <SubmitButton pending={pending}>Đổi mật khẩu</SubmitButton>
    </form>
  );
}
