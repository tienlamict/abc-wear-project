import { execSync } from "node:child_process";
import { expect, test as setup } from "@playwright/test";

const MAIN_URL = process.env.MAIN_SYSTEM_URL ?? "http://localhost:4100";

// The worker syncs on startup too, but a one-off `pnpm sync` makes the data deterministic
// before the first test, whether the dev server was already running or not.
setup("Main System data is synced into the Selling DB", async ({ request }) => {
  await expect
    .poll(async () => (await request.get(`${MAIN_URL}/healthz`).catch(() => null))?.ok(), {
      timeout: 60_000,
      message: `mock Main System at ${MAIN_URL} is not up`,
    })
    .toBe(true);
  execSync("pnpm sync", { stdio: "pipe" });

  const res = await request.get("/api/products");
  expect(res.ok()).toBe(true);
  expect((await res.json()).total).toBeGreaterThan(0);
});
