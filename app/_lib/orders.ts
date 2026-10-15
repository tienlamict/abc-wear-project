import { cache } from "react";
import { getMemberOrder } from "@/modules/order";

// Request-scoped dedupe: the [code] layout's existence check and the page share one query.
export const getMemberOrderCached = cache(getMemberOrder);
