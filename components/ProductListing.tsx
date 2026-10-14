import { type ProductFilters, type ProductListResult, filtersToQuery } from "@/modules/catalog";
import { FilterPanel } from "./FilterPanel";
import { Pagination } from "./Pagination";
import { ProductGrid } from "./ProductGrid";
import { SortSelect } from "./SortSelect";

/** Filters + sort + grid + pagination shared by the category and search pages. */
export function ProductListing({
  basePath,
  filters,
  result,
}: {
  basePath: string;
  filters: ProductFilters;
  result: ProductListResult;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      <aside>
        <FilterPanel filters={filters} facets={result.facets} />
      </aside>
      <section aria-label="Danh sách sản phẩm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p data-testid="result-count" className="text-sm text-gray-600">
            {result.total} sản phẩm
          </p>
          <SortSelect value={filters.sort} />
        </div>
        {result.items.length > 0 ? (
          <ProductGrid products={result.items} />
        ) : (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <p className="font-medium">Không tìm thấy sản phẩm phù hợp.</p>
            <p className="mt-1 text-sm text-gray-600">Hãy thử từ khóa khác hoặc bỏ bớt bộ lọc.</p>
          </div>
        )}
        <Pagination
          basePath={basePath}
          query={filtersToQuery(filters, ["page", "category"])}
          page={result.page}
          totalPages={result.totalPages}
        />
      </section>
    </div>
  );
}
