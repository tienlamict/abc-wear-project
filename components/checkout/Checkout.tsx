"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { formatVnd } from "@/lib/money";
import type { CartView } from "@/modules/order/cart";
import type { ShippingMethod } from "@/modules/order/shipping";
import { type ApiFailure, FormMessage, TextField } from "../form";

export interface CheckoutDetails {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shipLine1: string;
  shipWard: string;
  shipDistrict: string;
  shipProvince: string;
}

const STEPS = ["Thông tin giao hàng", "Phương thức giao", "Xác nhận đơn"] as const;

const REQUIRED: Record<keyof CheckoutDetails, string> = {
  customerName: "Vui lòng nhập họ tên",
  customerEmail: "Vui lòng nhập email",
  customerPhone: "Vui lòng nhập số điện thoại",
  shipLine1: "Vui lòng nhập địa chỉ",
  shipWard: "Vui lòng nhập phường/xã",
  shipDistrict: "Vui lòng nhập quận/huyện",
  shipProvince: "Vui lòng nhập tỉnh/thành phố",
};

/** Same rules as the server (src/lib/validation.ts), so step 1 can stop early. */
function validateDetails(d: CheckoutDetails): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, message] of Object.entries(REQUIRED)) {
    if (!d[key as keyof CheckoutDetails].trim()) fields[key] = message;
  }
  if (!fields.customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.customerEmail.trim())) {
    fields.customerEmail = "Email không hợp lệ";
  }
  if (!fields.customerPhone && !/^(0|\+84)\d{9}$/.test(d.customerPhone.replace(/[\s.-]/g, ""))) {
    fields.customerPhone = "Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0)";
  }
  return fields;
}

const CART_ERRORS = new Set(["CART_EMPTY", "NOT_PURCHASABLE", "OUT_OF_STOCK"]);

/**
 * OD-02/OD-03 in three steps: (1) recipient + address, (2) shipping method + COD total,
 * (3) review and place. One Idempotency-Key per visit, so retries never create a second order.
 */
export function Checkout({
  cart,
  methods,
  defaults,
}: {
  cart: CartView;
  methods: readonly ShippingMethod[];
  defaults: CheckoutDetails;
}) {
  const router = useRouter();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [details, setDetails] = useState(defaults);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [methodCode, setMethodCode] = useState(methods[0]!.code);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);

  const method = methods.find((m) => m.code === methodCode) ?? methods[0]!;
  const codAmount = cart.itemsTotal + method.fee;

  const submitDetails = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fields = validateDetails(details);
    setFieldErrors(fields);
    if (Object.keys(fields).length === 0) setStep(2);
  };

  const placeOrder = async () => {
    setPending(true);
    setError(null);
    const result = await fetch("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
      body: JSON.stringify({ ...details, shippingMethod: method.code }),
    })
      .then(async (res) => ({ res, body: await res.json().catch(() => null) }))
      .catch(() => null);

    if (result?.res.ok) {
      router.replace(`/dat-hang/hoan-tat/${encodeURIComponent(result.body.code)}`);
      router.refresh(); // header badge: the cart is now empty
      return;
    }
    setPending(false);
    const failure: ApiFailure = result?.body?.error
      ? {
          code: result.body.error.code,
          message: result.body.error.message,
          fields: result.body.error.details?.fields ?? {},
        }
      : {
          code: "NETWORK_ERROR",
          message: "Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.",
          fields: {},
        };
    setError(failure);
    if (Object.keys(failure.fields).some((k) => k in REQUIRED)) {
      setFieldErrors(failure.fields);
      setStep(1);
    }
  };

  const field = (name: keyof CheckoutDetails, label: string, extra: object = {}) => (
    <TextField
      label={label}
      name={name}
      value={details[name]}
      onChange={(e) => setDetails({ ...details, [name]: e.target.value })}
      error={fieldErrors[name]}
      required
      {...extra}
    />
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <ol aria-label="Các bước đặt hàng" className="mb-6 flex gap-2 text-sm">
          {STEPS.map((label, i) => (
            <li
              key={label}
              aria-current={step === i + 1 ? "step" : undefined}
              className={`flex-1 rounded border px-2 py-1.5 text-center ${
                step === i + 1
                  ? "border-gray-900 bg-gray-900 text-white"
                  : step > i + 1
                    ? "border-gray-400 text-gray-700"
                    : "text-gray-400"
              }`}
            >
              <span className="hidden sm:inline">{i + 1}. </span>
              {label}
            </li>
          ))}
        </ol>

        {error && (
          <div className="mb-4 space-y-2">
            <FormMessage error={error.message} />
            {CART_ERRORS.has(error.code) && (
              <Link href="/gio-hang" className="text-sm underline">
                Quay lại giỏ hàng
              </Link>
            )}
          </div>
        )}

        {step === 1 && (
          <form
            onSubmit={submitDetails}
            noValidate
            aria-label="Thông tin giao hàng"
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {field("customerName", "Họ tên người nhận", { autoComplete: "name" })}
              {field("customerPhone", "Số điện thoại", { type: "tel", autoComplete: "tel" })}
            </div>
            {field("customerEmail", "Email nhận xác nhận đơn", {
              type: "email",
              autoComplete: "email",
            })}
            {field("shipLine1", "Số nhà, tên đường", { autoComplete: "address-line1" })}
            <div className="grid gap-4 sm:grid-cols-3">
              {field("shipWard", "Phường/Xã")}
              {field("shipDistrict", "Quận/Huyện")}
              {field("shipProvince", "Tỉnh/Thành phố")}
            </div>
            <button
              type="submit"
              className="rounded bg-gray-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-gray-700"
            >
              Tiếp tục
            </button>
          </form>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="mb-2 font-semibold">Phương thức giao hàng</legend>
              {methods.map((m) => (
                <label
                  key={m.code}
                  className={`flex cursor-pointer items-center gap-3 rounded border p-3 ${
                    m.code === method.code ? "border-gray-900" : "border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="shippingMethod"
                    value={m.code}
                    checked={m.code === method.code}
                    onChange={() => setMethodCode(m.code)}
                  />
                  <span className="flex-1">
                    <span className="font-medium">{m.name}</span>
                    <span className="block text-sm text-gray-600">{m.description}</span>
                  </span>
                  <span className="font-semibold">{formatVnd(m.fee)}</span>
                </label>
              ))}
            </fieldset>
            <p className="rounded bg-gray-50 p-3 text-sm text-gray-700">
              Thanh toán khi nhận hàng (COD): bạn trả{" "}
              <strong data-testid="cod-step2">{formatVnd(codAmount)}</strong> cho nhân viên giao
              hàng.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded border px-6 py-2.5 text-sm"
              >
                Quay lại
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="rounded bg-gray-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-gray-700"
              >
                Tiếp tục
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <section aria-label="Sản phẩm">
              <h2 className="mb-2 font-semibold">Sản phẩm</h2>
              <ul className="divide-y rounded border text-sm">
                {cart.lines.map((l) => (
                  <li key={l.sku} className="flex justify-between gap-3 p-3">
                    <span>
                      {l.productName}
                      <span className="block text-gray-600">
                        {l.color} · Size {l.size} · SL {l.quantity}
                      </span>
                    </span>
                    <span className="whitespace-nowrap">{formatVnd(l.lineTotal)}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-label="Giao đến" className="text-sm">
              <h2 className="mb-1 font-semibold">Giao đến</h2>
              <p>
                {details.customerName} · {details.customerPhone} · {details.customerEmail}
              </p>
              <p>
                {details.shipLine1}, {details.shipWard}, {details.shipDistrict},{" "}
                {details.shipProvince}
              </p>
              <p className="mt-1">
                Phương thức: {method.name} ({method.description})
              </p>
            </section>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={pending}
                className="rounded border px-6 py-2.5 text-sm"
              >
                Quay lại
              </button>
              <button
                type="button"
                onClick={placeOrder}
                disabled={pending}
                className="flex-1 rounded bg-gray-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-60 sm:flex-none"
              >
                {pending ? "Đang đặt hàng…" : "Đặt hàng"}
              </button>
            </div>
          </div>
        )}
      </div>

      <aside
        aria-label="Tóm tắt đơn hàng"
        className="h-fit space-y-2 rounded-lg border p-4 text-sm"
      >
        <h2 className="font-semibold">Đơn hàng ({cart.itemCount} sản phẩm)</h2>
        <div className="flex justify-between">
          <span>Tiền hàng</span>
          <span data-testid="summary-items-total">{formatVnd(cart.itemsTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>Phí giao hàng ({method.name})</span>
          <span data-testid="summary-shipping-fee">{formatVnd(method.fee)}</span>
        </div>
        <div className="flex justify-between border-t pt-2 text-base font-semibold">
          <span>Tổng COD</span>
          <span data-testid="summary-cod">{formatVnd(codAmount)}</span>
        </div>
      </aside>
    </div>
  );
}
