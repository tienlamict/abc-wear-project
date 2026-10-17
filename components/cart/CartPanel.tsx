"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatVnd } from "@/lib/money";
import type { CartLine, CartView } from "@/modules/order/cart";
import { ImagePlaceholder } from "../ImagePlaceholder";
import { callApi } from "../form";

const MAX_LINE_QTY = 10; // QT7

function problemText(line: CartLine): string | null {
  if (line.problem === "UNAVAILABLE") return "Tạm hết hàng. Vui lòng bỏ sản phẩm này khỏi giỏ.";
  if (line.problem === "INSUFFICIENT_STOCK")
    return `Chỉ còn ${line.availableQty} sản phẩm. Vui lòng giảm số lượng.`;
  return null;
}

/** OD-01: change quantities, remove lines, go to checkout. */
export function CartPanel({ initialCart }: { initialCart: CartView }) {
  const router = useRouter();
  const [cart, setCart] = useState(initialCart);
  const [busySku, setBusySku] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutate = async (sku: string, request: Promise<Awaited<ReturnType<typeof callApi>>>) => {
    setBusySku(sku);
    const result = await request;
    setBusySku(null);
    if (result.ok) {
      setCart(result.data as CartView);
      setErrors((e) => ({ ...e, [sku]: "" }));
      router.refresh(); // header badge
    } else {
      setErrors((e) => ({ ...e, [sku]: result.error.message }));
    }
  };

  const setQuantity = (sku: string, quantity: number) =>
    mutate(sku, callApi(`/api/cart/items/${encodeURIComponent(sku)}`, { quantity }, "PATCH"));
  const remove = (sku: string) =>
    mutate(sku, callApi(`/api/cart/items/${encodeURIComponent(sku)}`, undefined, "DELETE"));

  if (cart.lines.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <p className="font-medium">Giỏ hàng đang trống.</p>
        <Link
          href="/"
          className="mt-4 inline-block rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          Tiếp tục mua sắm
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <ul aria-label="Sản phẩm trong giỏ" className="divide-y rounded-lg border">
        {cart.lines.map((line) => {
          const problem = problemText(line);
          const busy = busySku === line.sku;
          return (
            <li
              key={line.sku}
              data-testid="cart-line"
              data-sku={line.sku}
              className="flex gap-4 p-4"
            >
              <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded bg-gray-100">
                {line.image ? (
                  <Image
                    src={line.image}
                    alt={line.productName}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                ) : (
                  <ImagePlaceholder compact />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <Link href={`/san-pham/${line.productId}`} className="font-medium hover:underline">
                  {line.productName}
                </Link>
                <p className="text-sm text-gray-600">
                  {line.color} · Size {line.size} · {formatVnd(line.unitPrice)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <select
                    aria-label={`Số lượng ${line.productName} ${line.color} ${line.size}`}
                    value={line.quantity}
                    disabled={busy}
                    onChange={(e) => setQuantity(line.sku, Number(e.target.value))}
                    className="rounded border border-gray-300 px-2 py-1"
                  >
                    {Array.from(
                      { length: Math.max(MAX_LINE_QTY, line.quantity) },
                      (_, i) => i + 1,
                    ).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(line.sku)}
                    className="text-sm text-gray-600 underline"
                  >
                    Xóa
                  </button>
                  <span className="ml-auto font-semibold" data-testid="line-total">
                    {formatVnd(line.lineTotal)}
                  </span>
                </div>
                {problem && <p className="mt-2 text-sm text-amber-700">{problem}</p>}
                {errors[line.sku] && (
                  <p role="alert" className="mt-2 text-sm text-red-600">
                    {errors[line.sku]}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <aside className="h-fit space-y-3 rounded-lg border p-4">
        <div className="flex justify-between text-sm">
          <span>Tạm tính ({cart.itemCount} sản phẩm)</span>
          <span data-testid="items-total" className="font-semibold">
            {formatVnd(cart.itemsTotal)}
          </span>
        </div>
        <p className="text-xs text-gray-500">
          Phí giao hàng tính ở bước tiếp theo. Thanh toán khi nhận hàng (COD).
        </p>
        {cart.hasProblems ? (
          <p className="text-sm text-amber-700">
            Vui lòng xử lý các sản phẩm được đánh dấu trước khi đặt hàng.
          </p>
        ) : null}
        <Link
          href="/dat-hang"
          aria-disabled={cart.hasProblems}
          onClick={(e) => cart.hasProblems && e.preventDefault()}
          className={`block rounded px-4 py-2.5 text-center text-sm font-medium text-white ${
            cart.hasProblems ? "pointer-events-none bg-gray-300" : "bg-gray-900 hover:bg-gray-700"
          }`}
        >
          Tiến hành đặt hàng
        </Link>
      </aside>
    </div>
  );
}
