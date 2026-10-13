import { buildMockMain } from "./app";

const PORT = Number(process.env.MOCK_MAIN_PORT ?? 4100);

async function start(): Promise<void> {
  const app = buildMockMain();
  try {
    await app.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`[mock-main] listening on http://localhost:${PORT}`);
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
