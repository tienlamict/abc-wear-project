/** `pnpm sync`: one-off IF-01 + IF-02 run against Main System, then exit. */
import { prisma } from "@/lib/db";
import { createMainSystemClient, syncCatalog, syncStock } from "@/modules/integration";
import { loadConfigOrExit } from "./env";

async function main(): Promise<void> {
  const config = loadConfigOrExit("sync");
  console.log(`[sync] Main System at ${config.MAIN_SYSTEM_URL}`);
  const client = createMainSystemClient();

  const catalog = await syncCatalog(client);
  console.log(
    `[sync] IF-01 catalog: ${catalog.categories} categories, ${catalog.products} products, ` +
      `${catalog.variants} variants, ${catalog.deactivated} deactivated`,
  );

  const stock = await syncStock(client);
  console.log(
    `[sync] IF-02 stock: ${stock.received} received, ${stock.updated} updated, ` +
      `${stock.unknown} unknown SKUs`,
  );
}

main()
  .catch((err) => {
    console.error("[sync] failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
