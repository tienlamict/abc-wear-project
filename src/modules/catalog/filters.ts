import { z } from "zod";

export const PAGE_SIZE = 24;

export const SORTS = ["newest", "price_asc", "price_desc"] as const;
export type ProductSort = (typeof SORTS)[number];

export const SORT_LABELS: Record<ProductSort, string> = {
  newest: "Mới nhất",
  price_asc: "Giá tăng dần",
  price_desc: "Giá giảm dần",
};

const price = z.coerce.number().int().min(0).max(1_000_000_000);
const list = (max: number) => z.array(z.string().trim().min(1).max(max)).max(20).default([]);

const productFiltersSchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    category: z.string().trim().max(191).optional(),
    size: list(16),
    color: list(64),
    minPrice: price.optional(),
    maxPrice: price.optional(),
    sort: z.enum(SORTS).default("newest"),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
  })
  .refine((f) => f.minPrice === undefined || f.maxPrice === undefined || f.minPrice <= f.maxPrice, {
    path: ["maxPrice"],
    message: "Giá đến phải lớn hơn hoặc bằng giá từ",
  });

export type ProductFilters = z.infer<typeof productFiltersSchema>;

type QueryInput = URLSearchParams | Record<string, string | string[] | undefined>;

const LIST_KEYS = new Set(["size", "color"]);

/** Query string → plain object; empty values dropped, `size=M,L` and `size=M&size=L` both accepted. */
function normalize(input: QueryInput): Record<string, unknown> {
  const entries: [string, string][] =
    input instanceof URLSearchParams
      ? [...input.entries()]
      : Object.entries(input).flatMap(([key, value]) =>
          (Array.isArray(value) ? value : value === undefined ? [] : [value]).map(
            (v): [string, string] => [key, v],
          ),
        );

  const raw: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    if (LIST_KEYS.has(key)) {
      const values = value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      raw[key] = [...new Set([...((raw[key] as string[]) ?? []), ...values])];
    } else if (value.trim() !== "" && !(key in raw)) {
      raw[key] = value;
    }
  }
  return raw;
}

/**
 * Parses `/api/products` and listing-page query strings.
 * `strict` throws the ZodError (API → VALIDATION_ERROR); `lenient` drops invalid fields (pages).
 */
export function parseProductFilters(
  input: QueryInput,
  mode: "strict" | "lenient" = "strict",
): ProductFilters {
  const raw = normalize(input);
  const result = productFiltersSchema.safeParse(raw);
  if (result.success) return result.data;
  if (mode === "strict") throw result.error;
  for (const issue of result.error.issues) delete raw[String(issue.path[0])];
  return productFiltersSchema.parse(raw);
}

/** Inverse of parseProductFilters for building links; defaults are left out. */
export function filtersToQuery(
  filters: Partial<ProductFilters>,
  omit: (keyof ProductFilters)[] = [],
): URLSearchParams {
  const params = new URLSearchParams();
  const skip = new Set(omit);
  if (filters.q && !skip.has("q")) params.set("q", filters.q);
  if (filters.category && !skip.has("category")) params.set("category", filters.category);
  if (!skip.has("size")) for (const s of filters.size ?? []) params.append("size", s);
  if (!skip.has("color")) for (const c of filters.color ?? []) params.append("color", c);
  if (filters.minPrice !== undefined && !skip.has("minPrice"))
    params.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice !== undefined && !skip.has("maxPrice"))
    params.set("maxPrice", String(filters.maxPrice));
  if (filters.sort && filters.sort !== "newest" && !skip.has("sort"))
    params.set("sort", filters.sort);
  if (filters.page && filters.page > 1 && !skip.has("page"))
    params.set("page", String(filters.page));
  return params;
}

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

/** S < M < L < XL < XXL; unknown sizes go last, alphabetically. */
export function compareSizes(a: string, b: string): number {
  const ia = SIZE_ORDER.indexOf(a.toUpperCase());
  const ib = SIZE_ORDER.indexOf(b.toUpperCase());
  if (ia !== -1 && ib !== -1) return ia - ib;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;
  return a.localeCompare(b, "vi");
}
