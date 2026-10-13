/**
 * Loads `.env` into process.env for standalone Node processes (worker, scripts).
 * Next.js loads `.env` by itself, so the web app does not need this.
 */
export function loadEnvFile(path = ".env"): void {
  try {
    process.loadEnvFile(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
