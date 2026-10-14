import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { PAGE_SIZE, type ProductFilters, type ProductSort, compareSizes } from "./filters";

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  children: { id: string; name: string; slug: string }[];
}

/** PS-03: two-level category tree (parents with their children), by name. */
export async function getCategoryTree(): Promise<CategoryNode[]> {
  const select = { id: true, name: true, slug: true } as const;
  return prisma.category.findMany({
    where: { parentId: null },
    select: { ...select, children: { select, orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
}

export interface CategoryInfo {
  id: string;
  name: string;
  slug: string;
  parent: { name: string; slug: string } | null;
  children: { name: string; slug: string }[];
}

export async function getCategoryBySlug(slug: string): Promise<CategoryInfo | null> {
  return prisma.category.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      parent: { select: { name: true, slug: true } },
      children: { select: { name: true, slug: true }, orderBy: { name: "asc" } },
    },
  });
}

export interface ProductSummary {
  id: string;
  name: string;
  image: string | null;
  /** Cheapest/most expensive variant matching the filters (all variants when unfiltered). */
  minPrice: number;
  maxPrice: number;
  colors: string[];
  inStock: boolean;
}

export interface ProductListResult {
  items: ProductSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** Sizes and colors available for the current keyword/category, for the filter panel. */
  facets: { sizes: string[]; colors: string[] };
}

function toImages(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Escapes LIKE wildcards so a keyword is matched literally. */
function likeContains(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const ORDER_BY: Record<ProductSort, Prisma.Sql> = {
  newest: Prisma.sql`p.createdAt DESC, p.id ASC`,
  price_asc: Prisma.sql`minPrice ASC, p.id ASC`,
  price_desc: Prisma.sql`minPrice DESC, p.id ASC`,
};

async function categoryIdsFor(slug: string): Promise<string[]> {
  const category = await prisma.category.findUnique({
    where: { slug },
    select: { id: true, children: { select: { id: true } } },
  });
  if (!category) throw new AppError("NOT_FOUND", "Không tìm thấy danh mục.");
  return [category.id, ...category.children.map((c) => c.id)]; // a parent includes its children
}

/**
 * PS-01/02/03: active products matching keyword (name + description, accent-insensitive via
 * the column collation), category (parent includes children) and variant filters. A product
 * matches when one variant satisfies size, color and price range together.
 */
export async function listProducts(filters: ProductFilters): Promise<ProductListResult> {
  const scope: Prisma.Sql[] = [Prisma.sql`p.isActive = TRUE`];
  if (filters.q) {
    const like = likeContains(filters.q);
    scope.push(Prisma.sql`(p.name LIKE ${like} OR p.description LIKE ${like})`);
  }
  if (filters.category) {
    scope.push(
      Prisma.sql`p.categoryId IN (${Prisma.join(await categoryIdsFor(filters.category))})`,
    );
  }

  const variantFilters: Prisma.Sql[] = [];
  if (filters.size.length)
    variantFilters.push(Prisma.sql`v.size IN (${Prisma.join(filters.size)})`);
  if (filters.color.length)
    variantFilters.push(Prisma.sql`v.color IN (${Prisma.join(filters.color)})`);
  if (filters.minPrice !== undefined)
    variantFilters.push(Prisma.sql`v.price >= ${filters.minPrice}`);
  if (filters.maxPrice !== undefined)
    variantFilters.push(Prisma.sql`v.price <= ${filters.maxPrice}`);

  const from = Prisma.sql`FROM product p JOIN product_variant v ON v.productId = p.id`;
  const where = Prisma.sql`WHERE ${Prisma.join([...scope, ...variantFilters], " AND ")}`;
  const scopeWhere = Prisma.sql`WHERE ${Prisma.join(scope, " AND ")}`;
  const offset = (filters.page - 1) * PAGE_SIZE;

  const [rows, [count], sizeRows, colorRows] = await Promise.all([
    prisma.$queryRaw<{ id: string; minPrice: number; maxPrice: number }[]>`
      SELECT p.id AS id, MIN(v.price) AS minPrice, MAX(v.price) AS maxPrice
      ${from} ${where}
      GROUP BY p.id
      ORDER BY ${ORDER_BY[filters.sort]}
      LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    prisma.$queryRaw<{ total: bigint }[]>`SELECT COUNT(DISTINCT p.id) AS total ${from} ${where}`,
    prisma.$queryRaw<{ value: string }[]>`SELECT DISTINCT v.size AS value ${from} ${scopeWhere}`,
    prisma.$queryRaw<{ value: string }[]>`SELECT DISTINCT v.color AS value ${from} ${scopeWhere}`,
  ]);

  const details = await prisma.product.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    select: {
      id: true,
      name: true,
      images: true,
      variants: { select: { color: true, availableQty: true }, orderBy: { sku: "asc" } },
    },
  });
  const byId = new Map(details.map((d) => [d.id, d]));

  const items = rows.flatMap((row): ProductSummary[] => {
    const product = byId.get(row.id);
    if (!product) return [];
    return [
      {
        id: product.id,
        name: product.name,
        image: toImages(product.images)[0] ?? null,
        minPrice: Number(row.minPrice),
        maxPrice: Number(row.maxPrice),
        colors: [...new Set(product.variants.map((v) => v.color))],
        inStock: product.variants.some((v) => v.availableQty > 0),
      },
    ];
  });

  const total = Number(count?.total ?? 0);
  return {
    items,
    total,
    page: filters.page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    facets: {
      sizes: sizeRows.map((r) => r.value).sort(compareSizes),
      colors: colorRows.map((r) => r.value).sort((a, b) => a.localeCompare(b, "vi")),
    },
  };
}

export interface ProductVariantInfo {
  sku: string;
  size: string;
  color: string;
  price: number;
  availableQty: number;
  /** QT6: active product and stock left. */
  purchasable: boolean;
}

export interface ProductDetail {
  id: string;
  name: string;
  description: string;
  images: string[];
  isActive: boolean;
  purchasable: boolean;
  minPrice: number;
  maxPrice: number;
  category: { name: string; slug: string; parent: { name: string; slug: string } | null };
  variants: ProductVariantInfo[];
}

/** PS-04: product with stock per size/color. Inactive products are returned, not purchasable. */
export async function getProduct(id: string): Promise<ProductDetail | null> {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: {
        select: { name: true, slug: true, parent: { select: { name: true, slug: true } } },
      },
      variants: true,
    },
  });
  if (!product) return null;

  const variants = product.variants
    .map(({ sku, size, color, price, availableQty }): ProductVariantInfo => ({
      sku,
      size,
      color,
      price,
      availableQty,
      purchasable: product.isActive && availableQty > 0,
    }))
    .sort((a, b) => a.color.localeCompare(b.color, "vi") || compareSizes(a.size, b.size));
  const prices = variants.map((v) => v.price);

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    images: toImages(product.images),
    isActive: product.isActive,
    purchasable: variants.some((v) => v.purchasable),
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
    category: product.category,
    variants,
  };
}
