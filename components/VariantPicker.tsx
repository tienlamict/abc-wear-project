"use client";

import { useState } from "react";
import type { ProductVariantInfo } from "@/modules/catalog/queries";
import { PriceTag } from "./PriceTag";
import { StockBadge } from "./StockBadge";

function initialVariant(variants: ProductVariantInfo[]): ProductVariantInfo | undefined {
  return variants.find((v) => v.purchasable) ?? variants[0];
}

/** PS-04: pick color then size; shows price and stock of the chosen variant. */
export function VariantPicker({ variants }: { variants: ProductVariantInfo[] }) {
  const [selected, setSelected] = useState(() => initialVariant(variants));
  const [notice, setNotice] = useState<string | null>(null);

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
        <button
          type="button"
          disabled={!selected.purchasable}
          onClick={() => setNotice("Giỏ hàng đang được hoàn thiện, bạn vui lòng quay lại sau.")}
          className="w-full rounded bg-gray-900 px-6 py-3 font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600 sm:w-auto"
        >
          Thêm vào giỏ
        </button>
        {!selected.purchasable && (
          <p className="mt-2 text-sm text-gray-600">
            Phiên bản này tạm hết hàng. Vui lòng chọn màu hoặc kích cỡ khác.
          </p>
        )}
        {notice && (
          <p role="status" className="mt-2 text-sm text-gray-700">
            {notice}
          </p>
        )}
      </div>
    </div>
  );
}
