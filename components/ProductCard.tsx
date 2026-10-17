import Image from "next/image";
import Link from "next/link";
import type { ProductSummary } from "@/modules/catalog";
import { ImagePlaceholder } from "./ImagePlaceholder";
import { PriceTag } from "./PriceTag";

export function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <article data-testid="product-card" className="group">
      <Link href={`/san-pham/${product.id}`} className="block">
        <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-gray-100">
          {product.image ? (
            <Image
              src={product.image}
              alt={product.name}
              fill
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
              className="object-cover transition group-hover:scale-105"
            />
          ) : (
            <ImagePlaceholder />
          )}
          {!product.inStock && (
            <span className="absolute left-2 top-2 rounded bg-gray-900/80 px-2 py-0.5 text-xs text-white">
              Tạm hết hàng
            </span>
          )}
        </div>
        <h3
          data-testid="product-name"
          className="mt-2 line-clamp-2 text-sm text-gray-800 group-hover:underline"
        >
          {product.name}
        </h3>
      </Link>
      <div className="mt-1 flex items-center justify-between gap-2">
        <PriceTag min={product.minPrice} max={product.maxPrice} className="text-sm" />
        <span className="text-xs text-gray-500">{product.colors.length} màu</span>
      </div>
    </article>
  );
}
