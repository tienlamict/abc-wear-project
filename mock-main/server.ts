import { loadEnvFile } from "../src/lib/load-env";
import { buildMockMain } from "./app";

loadEnvFile();

const PORT = Number(process.env.MOCK_MAIN_PORT ?? 4100);
const WEB_BASE_URL = (process.env.WEB_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
// IF-05 target; override with MOCK_WEBHOOK_URL when the website runs elsewhere.
const WEBHOOK_URL = process.env.MOCK_WEBHOOK_URL ?? `${WEB_BASE_URL}/api/integration/order-status`;

async function start(): Promise<void> {
  const app = buildMockMain({
    webhookUrl: WEBHOOK_URL,
    webhookSecret: process.env.MAIN_WEBHOOK_SECRET,
  });
  try {
    await app.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`[mock-main] listening on http://localhost:${PORT} (demo page: /sim)`);
    console.log(`[mock-main] IF-05 webhook → ${WEBHOOK_URL}`);
  } catch (err) {
    console.error("[mock-main] failed to start", err);
    process.exit(1);
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void app.close().then(() => process.exit(0));
    });
  }
}

void start();
