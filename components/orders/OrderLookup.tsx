"use client";

import { type FormEvent, useState } from "react";
import type { OrderDetail } from "@/modules/order/queries";
import { FormMessage, SubmitButton, TextField, callApi, formValues, useFormState } from "../form";
import { OrderDetailView } from "./OrderDetailView";

/** OD-05: order code + the email used at checkout → status and details. */
export function OrderLookup({
  defaultCode,
  defaultEmail,
}: {
  defaultCode: string;
  defaultEmail: string;
}) {
  const { pending, setPending, error, setError } = useFormState();
  const [order, setOrder] = useState<OrderDetail | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await callApi<OrderDetail>("/api/orders/lookup", formValues(e.currentTarget));
    setPending(false);
    if (result.ok) {
      setOrder(result.data);
    } else {
      setOrder(null);
      setError(result.error);
    }
  };

  return (
    <div className="space-y-8">
      <form
        onSubmit={onSubmit}
        noValidate
        aria-label="Tra cứu đơn hàng"
        className="grid gap-4 rounded-lg border p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
      >
        <TextField
          label="Mã đơn hàng"
          name="code"
          placeholder="ABC-261015-XXXXX"
          defaultValue={defaultCode}
          autoComplete="off"
          required
          error={error?.fields.code}
        />
        <TextField
          label="Email đặt hàng"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={defaultEmail}
          required
          error={error?.fields.email}
        />
        <div className="sm:pt-6">
          <SubmitButton pending={pending}>Tra cứu</SubmitButton>
        </div>
        {error && Object.keys(error.fields).length === 0 && (
          <div className="sm:col-span-3">
            <FormMessage error={error.message} />
          </div>
        )}
      </form>
      {order && <OrderDetailView order={order} />}
    </div>
  );
}
