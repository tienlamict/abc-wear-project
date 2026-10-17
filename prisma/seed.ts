/**
 * `pnpm db:seed`: fills the Selling DB with the mock Main System's catalog and stock (IF-01 + IF-02)
 * without needing the mock server: it starts one in-process on a free port, syncs, and stops.
 * `pnpm dev` does the same on its own (the worker syncs at startup); this is for a fresh DB.
 */
import type { AddressInfo } from "node:net";
import { prisma } from "@/lib/db";
import { HttpMainSystemClient, syncCatalog, syncStock } from "@/modules/integration";
import { loadConfigOrExit } from "../worker/env";
import { buildMockMain } from "../mock-main/app";
import { DEFAULT_STORE_FILE } from "../mock-main/store";

async function main(): Promise<void> {
  const config = loadConfigOrExit("seed");
  // Same data as the real mock (its store file, or the seed on first run), images on MinIO.
  const mock = buildMockMain({
    storeFile: process.env.MOCK_STORE_FILE ?? DEFAULT_STORE_FILE,
    imagePublicUrl: process.env.MINIO_PUBLIC_URL,
  });
  await mock.listen({ port: 0, host: "127.0.0.1" });
  const { port } = mock.server.address() as AddressInfo;
  try {
    const client = new HttpMainSystemClient({
      baseUrl: `http://127.0.0.1:${port}`,
      timeoutMs: config.MAIN_TIMEOUT_MS,
    });
    const catalog = await syncCatalog(client);
    const stock = await syncStock(client);
    console.log(
      `[seed] ${catalog.categories} categories, ${catalog.products} products, ` +
        `${catalog.variants} variants, ${stock.updated} stock levels`,
    );
  } finally {
    await mock.close();
  }
}

main()
  .catch((err) => {
    console.error("[seed] failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
