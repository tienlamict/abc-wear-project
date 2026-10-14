import { cache } from "react";
import { getCategoryBySlug, getProduct } from "@/modules/catalog";

// Request-scoped dedupe: generateMetadata and the page share one query.
export const getProductCached = cache(getProduct);
export const getCategoryCached = cache(getCategoryBySlug);
