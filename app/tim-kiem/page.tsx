import type { Metadata } from "next";
import { ProductListing } from "@/components/ProductListing";
import { listProducts, parseProductFilters } from "@/modules/catalog";

interface Props {
  searchParams: Record<string, string | string[] | undefined>;
}

export function generateMetadata({ searchParams }: Props): Metadata {
  const { q } = parseProductFilters(searchParams, "lenient");
  return { title: q ? `Tìm "${q}"` : "Tất cả sản phẩm" };
}

/** PS-01, PS-02 */
export default async function SearchPage({ searchParams }: Props) {
  const { category: _ignored, ...filters } = parseProductFilters(searchParams, "lenient");
  const result = await listProducts(filters);

  return (
    <>
      <h1 className="text-2xl font-bold">
        {filters.q ? (
          <>
            Kết quả cho &ldquo;<span data-testid="search-term">{filters.q}</span>&rdquo;
          </>
        ) : (
          "Tất cả sản phẩm"
        )}
      </h1>
      <div className="mt-6">
        <ProductListing basePath="/tim-kiem" filters={filters} result={result} />
      </div>
    </>
  );
}
