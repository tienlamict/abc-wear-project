import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ProductGallery } from "@/components/ProductGallery";
import { VariantPicker } from "@/components/VariantPicker";
import { getProductCached } from "../../_lib/catalog";

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProductCached(params.id);
  return { title: product?.name ?? "Không tìm thấy sản phẩm" };
}

/** PS-04 */
export default async function ProductPage({ params }: Props) {
  const product = await getProductCached(params.id);
  if (!product) notFound();

  const { category } = product;
  return (
    <>
      <Breadcrumbs
        items={[
          ...(category.parent
            ? [{ label: category.parent.name, href: `/danh-muc/${category.parent.slug}` }]
            : []),
          { label: category.name, href: `/danh-muc/${category.slug}` },
          { label: product.name },
        ]}
      />
      <div className="grid gap-8 md:grid-cols-2">
        <ProductGallery images={product.images} name={product.name} />

        <div>
          <h1 className="text-2xl font-bold">{product.name}</h1>
          {!product.isActive && (
            <p className="mt-2 rounded bg-gray-100 px-3 py-2 text-sm text-gray-700">
              Sản phẩm này tạm ngừng kinh doanh.
            </p>
          )}
          <div className="mt-4">
            <VariantPicker variants={product.variants} />
          </div>
          <section className="mt-8 border-t pt-6">
            <h2 className="mb-2 font-semibold">Mô tả sản phẩm</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
              {product.description}
            </p>
          </section>
          <p className="mt-6 text-sm text-gray-600">
            Thanh toán khi nhận hàng (COD) · Giao hàng toàn quốc
          </p>
        </div>
      </div>
    </>
  );
}
