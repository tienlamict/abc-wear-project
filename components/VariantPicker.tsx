"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProductVariantInfo } from "@/modules/catalog/queries";
import { PriceTag } from "./PriceTag";
import { StockBadge } from "./StockBadge";
import { callApi } from "./form";

const MAX_LINE_QTY = 10; // QT7

function initialVariant(variants: ProductVariantInfo[]): ProductVariantInfo | undefined {
  return variants.find((v) => v.purchasable) ?? variants[0];
}

type Notice = { ok: boolean; message: string } | null;

/** PS-04 + OD-01: pick color, size and quantity; shows price and stock; adds to the cart. */
export function VariantPicker({ variants }: { variants: ProductVariantInfo[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(() => initialVariant(variants));
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  if (!selected) return <p className="text-sm text-gray-600">Sản phẩm chưa có phiên bản để bán.</p>;

  const colors = [...new Set(variants.map((v) => v.color))];
  const sizes = variants.filter((v) => v.color === selected.color);

  const chooseColor = (color: string) => {
    const ofColor = variants.filter((v) => v.color === color);
    setSelected(
      ofColor.find((v) => v.size === selected.size) ?? initialVariant(ofColor) ?? selected,
    );
    setNotice(null);
  };
  const chooseSize = (variant: ProductVariantInfo) => {
    setSelected(variant);
    setNotice(null);
  };

  const addToCart = async () => {
    setPending(true);
    setNotice(null);
    const result = await callApi("/api/cart/items", { sku: selected.sku, quantity });
    setPending(false);
    if (result.ok) {
      setNotice({ ok: true, message: `Đã thêm ${quantity} sản phẩm vào giỏ hàng.` });
      router.refresh(); // header badge
    } else {
      setNotice({ ok: false, message: result.error.message });
    }
  };

  const option = (active: boolean) =>
    `rounded border px-3 py-1.5 text-sm ${
      active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 hover:border-gray-500"
    }`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <PriceTag min={selected.price} className="text-2xl" />
        <StockBadge qty={selected.availableQty} purchasable={selected.purchasable} />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">
          Màu sắc: <span className="font-normal">{selected.color}</span>
        </p>
        <div role="group" aria-label="Màu sắc" className="flex flex-wrap gap-2">
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              aria-pressed={color === selected.color}
              onClick={() => chooseColor(color)}
              className={option(color === selected.color)}
            >
              {color}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">
          Kích cỡ: <span className="font-normal">{selected.size}</span>
        </p>
        <div role="group" aria-label="Kích cỡ" className="flex flex-wrap gap-2">
          {sizes.map((v) => (
            <button
              key={v.sku}
              type="button"
              aria-pressed={v.sku === selected.sku}
              onClick={() => chooseSize(v)}
              className={`${option(v.sku === selected.sku)} min-w-12 ${
                v.purchasable ? "" : "text-gray-400 line-through"
              }`}
            >
              {v.size}
              {!v.purchasable && <span className="sr-only"> (tạm hết hàng)</span>}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-semibold">
            Số lượng
            <select
              value={quantity}
              onChange={(e) => {
                setQuantity(Number(e.target.value));
                setNotice(null);
              }}
              disabled={!selected.purchasable}
              className="mt-1 block rounded border border-gray-300 px-3 py-2.5 font-normal"
            >
              {Array.from({ length: MAX_LINE_QTY }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!selected.purchasable || pending}
            onClick={addToCart}
            className="flex-1 rounded bg-gray-900 px-6 py-3 font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600 sm:flex-none"
          >
            {pending ? "Đang thêm…" : "Thêm vào giỏ"}
          </button>
        </div>
        {!selected.purchasable && (
          <p className="mt-2 text-sm text-gray-600">
            Phiên bản này tạm hết hàng. Vui lòng chọn màu hoặc kích cỡ khác.
          </p>
        )}
        {notice?.ok && (
          <p role="status" className="mt-2 text-sm text-emerald-700">
            {notice.message}{" "}
            <Link href="/gio-hang" className="font-medium underline">
              Xem giỏ hàng
            </Link>
          </p>
        )}
        {notice && !notice.ok && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {notice.message}
          </p>
        )}
      </div>
    </div>
  );
}
