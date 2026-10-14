import { z } from "zod";
import rawMethods from "../../../config/shipping-methods.json";

// OD-03: shipping methods and fees come from config/shipping-methods.json (read at startup).

const shippingMethodsSchema = z
  .array(
    z.object({
      code: z.string().regex(/^[A-Z0-9_]{1,32}$/),
      name: z.string().min(1),
      description: z.string(),
      fee: z.number().int().nonnegative(),
    }),
  )
  .min(1)
  .refine((methods) => new Set(methods.map((m) => m.code)).size === methods.length, {
    error: "shipping method codes must be unique",
  });

export type ShippingMethod = z.infer<typeof shippingMethodsSchema>[number];

const methods: readonly ShippingMethod[] = shippingMethodsSchema.parse(rawMethods);

export function listShippingMethods(): readonly ShippingMethod[] {
  return methods;
}

export function findShippingMethod(code: string): ShippingMethod | undefined {
  return methods.find((m) => m.code === code);
}
