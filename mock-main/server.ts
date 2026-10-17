import { loadEnvFile } from "../src/lib/load-env";
import { buildMockMain } from "./app";
import { createMinioStorage, minioConfigFromEnv } from "./minio";
import { seedImagesIfEmpty } from "./seed-images";
import { DEFAULT_STORE_FILE } from "./store";

loadEnvFile();

const PORT = Number(process.env.MOCK_MAIN_PORT ?? 4100);
const WEB_BASE_URL = (process.env.WEB_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
// Webhook targets; override with MOCK_WEBHOOK_URL when the website runs elsewhere.
const WEBHOOK_URL = process.env.MOCK_WEBHOOK_URL ?? `${WEB_BASE_URL}/api/integration/order-status`;
const CATALOG_WEBHOOK_URL = `${WEB_BASE_URL}/api/integration/catalog-changed`;

async function start(): Promise<void> {
  const minio = minioConfigFromEnv();
  if (!minio) console.warn("[mock-main] MINIO_* not set: image upload is disabled");
  const storage = minio ? createMinioStorage(minio) : null;

  const user = process.env.MOCK_ADMIN_USER;
  const password = process.env.MOCK_ADMIN_PASSWORD;
  if (!user || !password) {
    console.warn(
      "[mock-main] MOCK_ADMIN_USER / MOCK_ADMIN_PASSWORD not set: /admin uses admin / change-me",
    );
  }

  const app = buildMockMain({
    storeFile: process.env.MOCK_STORE_FILE ?? DEFAULT_STORE_FILE,
    webhookUrl: WEBHOOK_URL,
    webhookSecret: process.env.MAIN_WEBHOOK_SECRET,
    catalogWebhookUrl: CATALOG_WEBHOOK_URL,
    imagePublicUrl: minio?.publicUrl,
    storage,
    admin: { user: user || "admin", password: password || "change-me" },
  });
  try {
    await app.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`[mock-main] listening on http://localhost:${PORT} (admin: /admin, demo: /sim)`);
    console.log(`[mock-main] webhooks → ${WEBHOOK_URL}, ${CATALOG_WEBHOOK_URL}`);
  } catch (err) {
    console.error("[mock-main] failed to start", err);
    process.exit(1);
  }

  if (storage) void seedImagesIfEmpty(storage);

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void app.close().then(() => process.exit(0));
    });
  }
}

void start();
