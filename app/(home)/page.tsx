import Image from "next/image";
import Link from "next/link";
import heroBanner from "../../public/images/hero-banner.webp";
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
      <section className="relative isolate overflow-hidden rounded-xl bg-[#e9dccb]">
        <Image
          src={heroBanner}
          alt=""
          fill
          priority
          placeholder="blur"
          sizes="(min-width: 1280px) 1280px, 100vw"
          className="-z-10 object-cover object-right"
        />
        {/* Keeps the text readable where it overlaps the picture (narrow screens). */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#efe4d6] via-[#efe4d6]/80 to-transparent sm:via-[#efe4d6]/40" />
        <div className="max-w-md px-6 py-12 sm:px-10 sm:py-20">
          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">Thời trang ABC Wear</h1>
          <p className="mt-3 text-gray-700">
            Giao hàng toàn quốc, thanh toán khi nhận hàng. Không cần tài khoản để đặt mua.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/danh-muc/nu"
              className="rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-700"
            >
              Thời trang nữ
            </Link>
            <Link
              href="/danh-muc/nam"
              className="rounded-md border border-gray-900 bg-white/70 px-5 py-2.5 text-sm font-medium text-gray-900 hover:bg-white"
            >
              Thời trang nam
            </Link>
          </div>
        </div>
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
