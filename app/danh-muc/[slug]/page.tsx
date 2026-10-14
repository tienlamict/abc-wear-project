import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ProductListing } from "@/components/ProductListing";
import { listProducts, parseProductFilters } from "@/modules/catalog";
import { getCategoryCached } from "../../_lib/catalog";

interface Props {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = await getCategoryCached(params.slug);
  return { title: category?.name ?? "Không tìm thấy danh mục" };
}

/** PS-02, PS-03 */
export default async function CategoryPage({ params, searchParams }: Props) {
  const category = await getCategoryCached(params.slug);
  if (!category) notFound();

  const filters = { ...parseProductFilters(searchParams, "lenient"), category: category.slug };
  const result = await listProducts(filters);

  return (
    <>
      <Breadcrumbs
        items={[
          ...(category.parent
            ? [{ label: category.parent.name, href: `/danh-muc/${category.parent.slug}` }]
            : []),
          { label: category.name },
        ]}
      />
      <h1 className="text-2xl font-bold">{category.name}</h1>
      {category.children.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {category.children.map((child) => (
            <li key={child.slug}>
              <Link
                href={`/danh-muc/${child.slug}`}
                className="block rounded-full border px-3 py-1 text-sm hover:bg-gray-50"
              >
                {child.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6">
        <ProductListing basePath={`/danh-muc/${category.slug}`} filters={filters} result={result} />
      </div>
    </>
  );
}
