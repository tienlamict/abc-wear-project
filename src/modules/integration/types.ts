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
