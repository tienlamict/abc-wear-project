import { z } from "zod";

// Main System payloads are external input: validate them before they reach the Selling DB.

export const catalogSnapshotSchema = z.object({
  categories: z.array(
    z.object({
      id: z.string().min(1).max(64),
      parentId: z.string().min(1).max(64).nullable(),
      name: z.string().min(1).max(191),
      slug: z.string().min(1).max(191),
    }),
  ),
  products: z.array(
    z.object({
      id: z.string().min(1).max(64),
      categoryId: z.string().min(1).max(64),
      name: z.string().min(1).max(255),
      description: z.string(),
      images: z.array(z.url()),
      isActive: z.boolean(),
      createdAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
      variants: z.array(
        z.object({
          sku: z.string().min(1).max(64),
          size: z.string().min(1).max(16),
          color: z.string().min(1).max(64),
          price: z.number().int().nonnegative(),
        }),
      ),
    }),
  ),
});

export type CatalogSnapshot = z.infer<typeof catalogSnapshotSchema>;

export const stockSnapshotSchema = z.object({
  items: z.array(z.object({ sku: z.string().min(1).max(64), qty: z.number().int() })),
});

export type StockItem = z.infer<typeof stockSnapshotSchema>["items"][number];

export type Iface = "IF-01" | "IF-02" | "IF-03" | "IF-04" | "IF-05";

export interface StockLine {
  sku: string;
  qty: number;
}

export const stockCheckResultSchema = z.object({
  ok: z.boolean(),
  shortages: z.array(
    z.object({ sku: z.string(), requested: z.number().int(), available: z.number().int() }),
  ),
});

export type StockCheckResult = z.infer<typeof stockCheckResultSchema>;

/** IF-04 payload: an order snapshot (QT2). `id` is the Selling order id, Main's idempotency key. */
export interface MainOrderPayload {
  id: string;
  code: string;
  createdAt: string;
  customer: { name: string; email: string; phone: string };
  shippingAddress: { line1: string; ward: string; district: string; province: string };
  shippingMethod: string;
  shippingFee: number;
  itemsTotal: number;
  codAmount: number;
  items: {
    sku: string;
    productName: string;
    size: string;
    color: string;
    unitPrice: number;
    quantity: number;
  }[];
}

export const sendOrderResultSchema = z.object({ mainOrderId: z.string().min(1).max(64) });
