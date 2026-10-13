import { type AppConfig, ConfigError, getConfig } from "@/lib/config";
import { loadEnvFile } from "@/lib/load-env";

function loadConfigOrExit(): AppConfig {
  loadEnvFile();
  try {
    return getConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[worker] ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}

function main(): void {
  const config = loadConfigOrExit();
  console.log(`[worker] started, Main System at ${config.MAIN_SYSTEM_URL}`);

  // Jobs (IF-01, IF-02 from M1; IF-04 from M4) are registered here.
  const keepAlive = setInterval(() => {}, 60_000);

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      console.log(`[worker] received ${signal}, shutting down`);
      clearInterval(keepAlive);
      process.exit(0);
    });
  }
}

main();
