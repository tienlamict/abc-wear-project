import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { type MainSystemClient, createMainSystemClient } from "./client";
import { syncCatalog, syncStock } from "./sync";
import { writeSyncLog } from "./sync-log";

export const catalogChangedSchema = z.object({ type: z.enum(["catalog", "stock"]) });

export type CatalogChangeType = z.infer<typeof catalogChangedSchema>["type"];

export interface CatalogChangedResult {
  synced: CatalogChangeType;
  products: number;
  variants: number;
  durationMs: number;
}

/** "catalog" → IF-01 then IF-02; "stock" → IF-02 only. */
async function runSync(
  type: CatalogChangeType,
  client: MainSystemClient,
): Promise<CatalogChangedResult> {
  const started = Date.now();
  const iface = type === "catalog" ? "IF-01" : "IF-02";
  try {
    let products: number;
    if (type === "catalog") {
      products = (await syncCatalog(client)).products;
    } else {
      products = await prisma.product.count({ where: { isActive: true } });
    }
    const stock = await syncStock(client);
    const result = {
      synced: type,
      products,
      variants: stock.received,
      durationMs: Date.now() - started,
    };
    await writeSyncLog({
      direction: "IN",
      iface,
      recordKey: "catalog-changed",
      result: "OK",
      message: `webhook type=${type}: products=${result.products} variants=${result.variants} (${result.durationMs}ms)`,
    });
    return result;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await writeSyncLog({
      direction: "IN",
      iface,
      recordKey: "catalog-changed",
      result: "ERROR",
      message: `webhook type=${type}: ${detail}`,
    });
    throw new AppError(
      "SYNC_FAILED",
      `Website chưa lấy được dữ liệu mới từ Main System: ${detail}`,
    );
  }
}

// One sync at a time in this process. A request arriving while one runs waits for it, then
// runs once more; requests arriving meanwhile share that next run (as "catalog" if any asked).
interface QueuedSync {
  catalog: boolean;
  promise: Promise<CatalogChangedResult>;
}
let tail: Promise<unknown> = Promise.resolve();
let queued: QueuedSync | null = null;

/** Sync now because Main says data changed (POST /api/integration/catalog-changed). */
export function syncOnCatalogChange(
  type: CatalogChangeType,
  client: MainSystemClient = createMainSystemClient(),
): Promise<CatalogChangedResult> {
  if (queued) {
    queued.catalog ||= type === "catalog";
    return queued.promise;
  }
  const entry = { catalog: type === "catalog" } as QueuedSync;
  entry.promise = tail.then(() => {
    if (queued === entry) queued = null;
    return runSync(entry.catalog ? "catalog" : "stock", client);
  });
  queued = entry;
  tail = entry.promise.catch(() => undefined);
  return entry.promise;
}
