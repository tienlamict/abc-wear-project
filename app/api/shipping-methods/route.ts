import { listShippingMethods } from "@/modules/order";

/** OD-03: from config/shipping-methods.json */
export function GET(): Response {
  return Response.json({ methods: listShippingMethods() });
}
