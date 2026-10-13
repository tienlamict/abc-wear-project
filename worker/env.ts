import { type AppConfig, ConfigError, getConfig } from "@/lib/config";
import { loadEnvFile } from "@/lib/load-env";

/** Loads `.env`, validates it, and exits with the list of problems if anything is wrong. */
export function loadConfigOrExit(tag: string): AppConfig {
  loadEnvFile();
  try {
    return getConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[${tag}] ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}
