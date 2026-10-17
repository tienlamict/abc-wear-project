import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import seedData from "./seed.json";
import type { MockOrder, Seed, SeedProduct, SeedVariant, StoreData } from "./types";

export const DEFAULT_STORE_FILE = fileURLToPath(new URL("./data/store.json", import.meta.url));

export interface StoreOptions {
  /** Initial catalog (and what `reset()` goes back to). Default: seed.json. */
  seed?: Seed;
  /** Where data persists. Without a file the store lives in memory only (tests). */
  file?: string;
}

/**
 * Main System's data: catalog and received orders. With a file, it is loaded on start (created
 * from the seed the first time) and written after every change: to a temp file first, then
 * renamed over the old one, so stopping the process mid-write never leaves a broken file.
 */
export class Store {
  readonly data: StoreData;
  private readonly seed: Seed;
  private readonly file: string | undefined;

  constructor(options: StoreOptions = {}) {
    this.seed = options.seed ?? (seedData as Seed);
    this.file = options.file;
    const loaded = this.file ? load(this.file) : null;
    this.data = loaded ?? fromSeed(this.seed);
    if (!loaded) this.save(); // first run: create the file from the seed
  }

  get categories() {
    return this.data.categories;
  }

  get products() {
    return this.data.products;
  }

  product(id: string): SeedProduct | undefined {
    return this.data.products.find((p) => p.id === id);
  }

  /** The variant and its product, by SKU (unique across the catalog). */
  variant(sku: string): { product: SeedProduct; variant: SeedVariant } | undefined {
    for (const product of this.data.products) {
      const variant = product.variants.find((v) => v.sku === sku);
      if (variant) return { product, variant };
    }
    return undefined;
  }

  /** Orders by the website's order id (IF-04 idempotency key). */
  order(id: string): MockOrder | undefined {
    return this.data.orders.find((o) => o.payload.id === id);
  }

  /** Catalog back to the seed. Orders are kept, and so are images in MinIO. */
  reset(): void {
    const fresh = fromSeed(this.seed);
    this.data.categories = fresh.categories;
    this.data.products = fresh.products;
    this.save();
  }

  save(): void {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2) + "\n");
    renameSync(tmp, this.file);
  }
}

function fromSeed(seed: Seed): StoreData {
  return { version: 1, ...structuredClone(seed), orders: [] };
}

function load(file: string): StoreData | null {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const data = JSON.parse(text) as StoreData;
  if (data.version !== 1 || !Array.isArray(data.products)) {
    throw new Error(`${file} is not a mock Main System store (delete it to start from the seed)`);
  }
  data.orders ??= [];
  return data;
}
