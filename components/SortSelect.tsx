"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SORTS, SORT_LABELS, type ProductSort } from "@/modules/catalog/filters";

export function SortSelect({ value }: { value: ProductSort }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onChange = (sort: string) => {
    const params = new URLSearchParams(searchParams);
    if (sort === "newest") params.delete("sort");
    else params.set("sort", sort);
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-gray-600">Sắp xếp</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-gray-300 px-2 py-1.5"
      >
        {SORTS.map((s) => (
          <option key={s} value={s}>
            {SORT_LABELS[s]}
          </option>
        ))}
      </select>
    </label>
  );
}
