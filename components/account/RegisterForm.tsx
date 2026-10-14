"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { FormMessage, SubmitButton, TextField, callApi, formValues, useFormState } from "../form";
import { mismatchError } from "./mismatch";

/** MA-01: the account works right away (no email verification). */
export function RegisterForm({ next }: { next: string }) {
  const router = useRouter();
  const { pending, setPending, error, setError } = useFormState();

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { confirmPassword, ...values } = formValues(e.currentTarget);
    if (values.password !== confirmPassword) {
      setError(mismatchError("confirmPassword"));
      return;
    }
    setPending(true);
    setError(null);
    const result = await callApi("/api/auth/register", values);
    if (result.ok) {
      router.push(next);
      router.refresh();
      return;
    }
    setError(result.error);
    setPending(false);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Đăng ký">
      <FormMessage error={error?.message} />
      <TextField
        label="Họ và tên"
        name="fullName"
        autoComplete="name"
        required
        error={error?.fields.fullName}
      />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={error?.fields.email}
      />
      <TextField
        label="Số điện thoại (không bắt buộc)"
        name="phone"
        type="tel"
        autoComplete="tel"
        error={error?.fields.phone}
      />
      <TextField
        label="Mật khẩu"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="Ít nhất 8 ký tự"
        error={error?.fields.password}
      />
      <TextField
        label="Nhập lại mật khẩu"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={error?.fields.confirmPassword}
      />
      <SubmitButton pending={pending}>Đăng ký</SubmitButton>
      {error?.code === "EMAIL_TAKEN" && (
        <p className="text-sm">
          <Link href={`/dang-nhap?next=${encodeURIComponent(next)}`} className="underline">
            Đăng nhập bằng email này
          </Link>
        </p>
      )}
    </form>
  );
}
