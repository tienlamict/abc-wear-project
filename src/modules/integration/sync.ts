import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { type MainSystemClient, createMainSystemClient } from "./client";
import { writeSyncLog } from "./sync-log";
import type { CatalogSnapshot, Iface } from "./types";

const BATCH_SIZE = 100;

async function inBatches(ops: Prisma.PrismaPromise<unknown>[]): Promise<void> {
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    await prisma.$transaction(ops.slice(i, i + BATCH_SIZE));
  }
}

/** Parents first, so the self-referencing foreign key is always satisfied. */
function parentsFirst(categories: CatalogSnapshot["categories"]): CatalogSnapshot["categories"] {
  const parentOf = new Map(categories.map((c) => [c.id, c.parentId]));
  const depth = (id: string): number => {
    let d = 0;
    for (let p = parentOf.get(id); p && d <= categories.length; p = parentOf.get(p)) d++;
    return d;
  };
  return [...categories].sort((a, b) => depth(a.id) - depth(b.id));
}

/** The fetch is already logged by the client; this records a failure applying the data. */
async function logApplyError(iface: Iface, err: unknown): Promise<void> {
  await writeSyncLog({
    direction: "IN",
    iface,
    result: "ERROR",
    message: `apply failed: ${err instanceof Error ? err.message : String(err)}`,
  });
}

export interface CatalogSyncResult {
  categories: number;
  products: number;
  variants: number;
  deactivated: number;
}

/**
 * IF-01: upserts categories, products and variants from Main System (stock levels excluded).
 * Products missing from the snapshot become inactive; variants missing from it drop to 0 stock.
 */
export async function syncCatalog(
  client: MainSystemClient = createMainSystemClient(),
): Promise<CatalogSyncResult> {
  const snapshot = await client.fetchCatalog();
  const now = new Date();

  try {
    await inBatches(
      parentsFirst(snapshot.categories).map(({ id, ...data }) =>
        prisma.category.upsert({ where: { id }, create: { id, ...data }, update: data }),
      ),
    );

    await inBatches(
      snapshot.products.map(({ id, variants: _variants, ...product }) => {
        const data = { ...product, syncedAt: now };
        return prisma.product.upsert({ where: { id }, create: { id, ...data }, update: data });
      }),
    );

    const variants = snapshot.products.flatMap((p) =>
      p.variants.map((v) => ({ ...v, productId: p.id })),
    );
    await inBatches(
      variants.map(({ sku, ...data }) =>
        prisma.productVariant.upsert({
          where: { sku },
          create: { sku, ...data, availableQty: 0 }, // real stock arrives with IF-02
          update: data,
        }),
      ),
    );

    const productIds = snapshot.products.map((p) => p.id);
    const { count: deactivated } = await prisma.product.updateMany({
      where: { id: { notIn: productIds }, isActive: true },
      data: { isActive: false, syncedAt: now },
    });
    await prisma.productVariant.updateMany({
      where: { sku: { notIn: variants.map((v) => v.sku) }, availableQty: { not: 0 } },
      data: { availableQty: 0 },
    });

    return {
      categories: snapshot.categories.length,
      products: productIds.length,
      variants: variants.length,
      deactivated,
    };
  } catch (err) {
    await logApplyError("IF-01", err);
    throw err;
  }
}

export interface StockSyncResult {
  received: number;
  updated: number;
  unknown: number;
}

/** IF-02: copies Main System stock into `availableQty`, touching only rows that changed. */
export async function syncStock(
  client: MainSystemClient = createMainSystemClient(),
): Promise<StockSyncResult> {
  const items = await client.fetchStock();

  try {
    const variants = await prisma.productVariant.findMany({
      select: { sku: true, availableQty: true },
    });
    const current = new Map(variants.map((v) => [v.sku, v.availableQty]));

    let unknown = 0;
    const changes: { sku: string; qty: number }[] = [];
    for (const item of items) {
      const qty = Math.max(0, item.qty);
      const before = current.get(item.sku);
      if (before === undefined) unknown++;
      else if (before !== qty) changes.push({ sku: item.sku, qty });
    }

    await inBatches(
      changes.map(({ sku, qty }) =>
        prisma.productVariant.update({ where: { sku }, data: { availableQty: qty } }),
      ),
    );

    return { received: items.length, updated: changes.length, unknown };
  } catch (err) {
    await logApplyError("IF-02", err);
    throw err;
  }
}
