"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { FormMessage, SubmitButton, TextField, callApi, formValues, useFormState } from "../form";

/** MA-02 */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const { pending, setPending, error, setError } = useFormState();

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await callApi("/api/auth/login", formValues(e.currentTarget));
    if (result.ok) {
      router.push(next);
      router.refresh();
      return;
    }
    setError(result.error);
    setPending(false);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Đăng nhập">
      <FormMessage error={error?.message} />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={error?.fields.email}
      />
      <TextField
        label="Mật khẩu"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={error?.fields.password}
      />
      <SubmitButton pending={pending}>Đăng nhập</SubmitButton>
      <div className="flex justify-between text-sm">
        <Link href="/quen-mat-khau" className="text-gray-600 underline">
          Quên mật khẩu?
        </Link>
        <Link
          href={`/dang-ky?next=${encodeURIComponent(next)}`}
          className="text-gray-600 underline"
        >
          Tạo tài khoản mới
        </Link>
      </div>
    </form>
  );
}
