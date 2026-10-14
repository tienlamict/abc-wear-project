import Link from "next/link";
import { ProductGrid } from "@/components/ProductGrid";
import { getCategoryTree, listProducts, parseProductFilters } from "@/modules/catalog";

export default async function HomePage() {
  const [categories, latest] = await Promise.all([
    getCategoryTree(),
    listProducts(parseProductFilters({ sort: "newest" })),
  ]);
  const newest = latest.items.slice(0, 8);

  return (
    <div className="space-y-10">
      <section className="rounded-xl bg-gray-900 px-6 py-10 text-white">
        <h1 className="text-2xl font-bold sm:text-3xl">Thời trang ABC Wear</h1>
        <p className="mt-2 max-w-xl text-gray-300">
          Giao hàng toàn quốc, thanh toán khi nhận hàng. Không cần tài khoản để đặt mua.
        </p>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Danh mục</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {categories.map((parent) => (
            <div key={parent.id} className="rounded-lg border p-4">
              <Link
                href={`/danh-muc/${parent.slug}`}
                className="text-base font-semibold hover:underline"
              >
                {parent.name}
              </Link>
              <ul className="mt-2 flex flex-wrap gap-2">
                {parent.children.map((child) => (
                  <li key={child.id}>
                    <Link
                      href={`/danh-muc/${child.slug}`}
                      className="block rounded-full border px-3 py-1 text-sm hover:bg-gray-50"
                    >
                      {child.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Sản phẩm mới</h2>
          <Link href="/tim-kiem" className="text-sm text-gray-600 hover:underline">
            Xem tất cả
          </Link>
        </div>
        {newest.length > 0 ? (
          <ProductGrid products={newest} />
        ) : (
          <p className="rounded-lg border border-dashed p-10 text-center text-gray-600">
            Chưa có sản phẩm. Dữ liệu sẽ xuất hiện sau khi đồng bộ với hệ thống chính.
          </p>
        )}
      </section>
    </div>
  );
}
