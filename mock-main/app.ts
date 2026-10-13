import Fastify from "fastify";

export function buildMockMain() {
  const app = Fastify({ logger: { level: "warn" } });

  app.get("/healthz", async () => ({ status: "ok", service: "mock-main" }));

  return app;
}
