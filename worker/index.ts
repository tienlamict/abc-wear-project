import { prisma } from "@/lib/db";
import { createMainSystemClient, syncCatalog, syncStock } from "@/modules/integration";
import { sendPendingOrders } from "@/modules/order";
import { loadConfigOrExit } from "./env";

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/**
 * Wraps a job so failures are logged, not thrown, and a run never overlaps the previous one.
 * Resolves to whether the run succeeded. `quiet` skips the log line for uneventful runs.
 */
function job<T>(
  name: string,
  run: () => Promise<T>,
  quiet: (result: T) => boolean = () => false,
): () => Promise<boolean> {
  let running = false;
  return async () => {
    if (running) return false;
    running = true;
    const started = Date.now();
    try {
      const result = await run();
      if (!quiet(result))
        console.log(`[worker] ${name}: ${JSON.stringify(result)} (${Date.now() - started}ms)`);
      return true;
    } catch (err) {
      console.error(`[worker] ${name} failed:`, err instanceof Error ? err.message : err);
      return false;
    } finally {
      running = false;
    }
  };
}

async function main(): Promise<void> {
  const config = loadConfigOrExit("worker");
  console.log(`[worker] started, Main System at ${config.MAIN_SYSTEM_URL}`);
  const client = createMainSystemClient();

  const catalog = job("IF-01 catalog", () => syncCatalog(client));
  const stock = job("IF-02 stock", () => syncStock(client));
  const orders = job(
    "IF-04 send orders",
    () => sendPendingOrders(client),
    (r) => r.sent + r.retrying + r.gaveUp === 0,
  );

  // Main System may come up after the worker (e.g. `pnpm dev`): retry the first catalog sync
  // every 15 seconds instead of waiting for the 10-minute cycle, then load stock right away.
  let startupRetry: NodeJS.Timeout | undefined;
  const startup = async () => {
    if (await catalog()) void stock();
    else startupRetry = setTimeout(() => void startup(), 15 * SECOND);
  };
  void startup();

  const timers = [
    setInterval(() => void catalog(), 10 * MINUTE),
    setInterval(() => void stock(), MINUTE),
    setInterval(() => void orders(), 5 * SECOND),
  ];

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      console.log(`[worker] received ${signal}, shutting down`);
      clearTimeout(startupRetry);
      timers.forEach(clearInterval);
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  }
}

void main();
