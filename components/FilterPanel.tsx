"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import type { ProductFilters } from "@/modules/catalog/filters";

/**
 * PS-02: size, color and price filters. A plain GET form (works without JS); with JS it
 * navigates client-side. Filters live only in the query string.
 */
export function FilterPanel({
  filters,
  facets,
}: {
  filters: ProductFilters;
  facets: { sizes: string[]; colors: string[] };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(e.currentTarget)) {
      if (typeof value === "string" && value.trim() !== "") params.append(key, value.trim());
    }
    const qs = params.toString();
    setOpen(false);
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const clearHref = filters.q ? `${pathname}?q=${encodeURIComponent(filters.q)}` : pathname;
  const hasFilters =
    filters.size.length > 0 ||
    filters.color.length > 0 ||
    filters.minPrice !== undefined ||
    filters.maxPrice !== undefined;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-medium md:hidden"
      >
        {open ? "Ẩn bộ lọc" : "Bộ lọc"}
        {hasFilters && " •"}
      </button>

      {/* key: reset unsubmitted inputs when the URL (and so the filters) change */}
      <form
        key={JSON.stringify(filters)}
        method="get"
        onSubmit={onSubmit}
        aria-label="Bộ lọc sản phẩm"
        className={`${open ? "block" : "hidden"} mt-3 space-y-5 md:mt-0 md:block`}
      >
        {filters.q && <input type="hidden" name="q" value={filters.q} />}
        {filters.sort !== "newest" && <input type="hidden" name="sort" value={filters.sort} />}

        {facets.sizes.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Kích cỡ</legend>
            <div className="flex flex-wrap gap-2">
              {facets.sizes.map((size) => (
                <label key={size} className="cursor-pointer">
                  <input
                    type="checkbox"
                    name="size"
                    value={size}
                    defaultChecked={filters.size.includes(size)}
                    className="peer sr-only"
                  />
                  <span className="block min-w-10 rounded border border-gray-300 px-2 py-1 text-center text-sm peer-checked:border-gray-900 peer-checked:bg-gray-900 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-gray-400">
                    {size}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {facets.colors.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Màu sắc</legend>
            <div className="space-y-1">
              {facets.colors.map((color) => (
                <label key={color} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="color"
                    value={color}
                    defaultChecked={filters.color.includes(color)}
                  />
                  {color}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Khoảng giá (₫)</legend>
          <div className="flex items-center gap-2">
            <input
              type="number"
              name="minPrice"
              min={0}
              step={1000}
              placeholder="Từ"
              aria-label="Giá từ"
              defaultValue={filters.minPrice}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
            <span className="text-gray-400">–</span>
            <input
              type="number"
              name="maxPrice"
              min={0}
              step={1000}
              placeholder="Đến"
              aria-label="Giá đến"
              defaultValue={filters.maxPrice}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
        </fieldset>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Áp dụng
          </button>
          {hasFilters && (
            <Link href={clearHref} className="text-sm text-gray-600 underline">
              Xóa bộ lọc
            </Link>
          )}
        </div>
      </form>
    </div>
  );
}
