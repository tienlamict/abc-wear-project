"use client";

import { type InputHTMLAttributes, useState } from "react";

export interface ApiFailure {
  code: string;
  message: string;
  fields: Record<string, string>;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure };

/** fetch + JSON for the app's own API; turns network and error responses into ApiFailure. */
export async function callApi<T>(
  url: string,
  body?: unknown,
  method: "POST" | "PATCH" = "POST",
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as
      | (T & {
          error?: { code: string; message: string; details?: { fields?: Record<string, string> } };
        })
      | null;
    if (res.ok) return { ok: true, data: json as T };
    return {
      ok: false,
      error: {
        code: json?.error?.code ?? "INTERNAL_ERROR",
        message: json?.error?.message ?? "Đã có lỗi xảy ra. Vui lòng thử lại sau.",
        fields: json?.error?.details?.fields ?? {},
      },
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: "Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.",
        fields: {},
      },
    };
  }
}

/** Form values as a plain object of strings. */
export function formValues(form: HTMLFormElement): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of new FormData(form)) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

/** Submit state shared by the account forms. */
export function useFormState() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  return { pending, setPending, error, setError, success, setSuccess };
}

export function TextField({
  label,
  name,
  error,
  hint,
  ...props
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = `field-${name}`;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`w-full rounded border px-3 py-2 text-sm ${
          error ? "border-red-500" : "border-gray-300"
        }`}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1 text-xs text-gray-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function FormMessage({
  error,
  success,
}: {
  error?: string | null;
  success?: string | null;
}) {
  if (error)
    return (
      <p
        role="alert"
        className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {error}
      </p>
    );
  if (success)
    return (
      <p
        role="status"
        className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
      >
        {success}
      </p>
    );
  return null;
}

export function SubmitButton({
  pending,
  children,
}: {
  pending: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-60"
    >
      {pending ? "Đang xử lý…" : children}
    </button>
  );
}
