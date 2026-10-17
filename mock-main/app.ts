import Fastify from "fastify";
import { type MockContext, NO_FAILURE } from "./context";
import { DEFAULT_PUBLIC_URL, type ImageStorage, publicUrlOf } from "./minio";
import { Notifier } from "./notify";
import { type AdminCredentials, adminRoutes } from "./routes/admin";
import { mainRoutes } from "./routes/main";
import { simRoutes } from "./routes/sim";
import { Store } from "./store";
import type { Seed } from "./types";

export { FAIL_MODES, type FailMode } from "./context";

export interface MockMainOptions {
  /** Initial catalog; default seed.json. */
  seed?: Seed;
  /** Persist data in this JSON file; without it everything lives in memory (tests). */
  storeFile?: string;
  /** How long a request hangs in fail-mode "timeout" (default 10 s, longer than the web's 3 s). */
  hangMs?: number;
  /** IF-05: where order status changes are pushed (the website's /api/integration/order-status). */
  webhookUrl?: string;
  /** Sent as the `x-main-secret` header with every webhook call. */
  webhookSecret?: string;
  /** The website's /api/integration/catalog-changed, called after every change in /admin. */
  catalogWebhookUrl?: string;
  /** Base of public image URLs (MINIO_PUBLIC_URL). */
  imagePublicUrl?: string;
  /** MinIO; without it image uploads answer 503. */
  storage?: ImageStorage | null;
  /** Basic auth for /admin. */
  admin?: AdminCredentials;
}

/**
 * The mock Main System: the website-facing API (/main), demo helpers (/sim) and product
 * management (/admin). `server.ts` starts it with settings from `.env`; tests build their own.
 */
export function buildMockMain(options: MockMainOptions = {}) {
  // forceCloseConnections: close() must not wait on keep-alive sockets left by fail-mode "timeout".
  const app = Fastify({ logger: { level: "warn" }, forceCloseConnections: true });
  const imagePublicUrl = options.imagePublicUrl ?? DEFAULT_PUBLIC_URL;

  const ctx: MockContext = {
    store: new Store({ seed: options.seed, file: options.storeFile }),
    storage: options.storage ?? null,
    notifier: new Notifier({ url: options.catalogWebhookUrl, secret: options.webhookSecret }),
    imageUrl: (key) => publicUrlOf(imagePublicUrl, key),
    fail: NO_FAILURE,
    hangMs: options.hangMs ?? 10_000,
    orderWebhook: { url: options.webhookUrl, secret: options.webhookSecret },
    bootId: Date.now().toString(36).toUpperCase(),
  };

  app.get("/healthz", async () => ({ status: "ok", service: "mock-main" }));
  app.register(mainRoutes(ctx), { prefix: "/main" });
  app.register(simRoutes(ctx), { prefix: "/sim" });
  app.register(adminRoutes(ctx, options.admin ?? { user: "admin", password: "change-me" }), {
    prefix: "/admin",
  });

  return Object.assign(app, { mock: ctx });
}

export type MockMainApp = ReturnType<typeof buildMockMain>;
