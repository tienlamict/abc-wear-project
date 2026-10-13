import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (p: string) => fileURLToPath(new URL(p, import.meta.url));

try {
  process.loadEnvFile(fromRoot("./.env"));
} catch {
  // no .env: rely on the environment
}

// Integration tests run against a separate database so they never touch dev data.
function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const url = new URL(process.env.DATABASE_URL ?? "mysql://root:root@localhost:3306/selling");
  url.pathname = "/selling_test";
  return url.toString();
}
process.env.TEST_DATABASE_URL = testDatabaseUrl();

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/components\/(.*)$/, replacement: `${fromRoot("./components/")}$1` },
      { find: /^@\/(.*)$/, replacement: `${fromRoot("./src/")}$1` },
    ],
  },
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"] },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          env: { DATABASE_URL: process.env.TEST_DATABASE_URL },
          fileParallelism: false, // tests share one database
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
