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

// `pnpm dev` compiles each route on its first request, which can take 20+ seconds on a fresh
// clone. Request every route once here so timing assertions in the tests measure the app.
const WARM_UP = [
  "/",
  "/danh-muc/nam",
  "/tim-kiem?q=ao",
  "/san-pham/P001",
  "/gio-hang",
  "/dat-hang",
  "/dat-hang/hoan-tat/ABC-000000-AAAAA",
  "/tra-cuu-don",
  "/dang-nhap",
  "/dang-ky",
  "/quen-mat-khau",
  "/dat-lai-mat-khau",
  "/tai-khoan",
  "/tai-khoan/don-hang",
  "/tai-khoan/don-hang/ABC-000000-AAAAA",
  "/api/categories",
  "/api/products/P001",
  "/api/cart",
  "/api/me",
  "/api/orders",
  "/api/shipping-methods",
  "/api/healthz",
];
const WARM_UP_POST = [
  "/api/cart/items",
  "/api/orders",
  "/api/orders/lookup",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/me/change-password",
  "/api/integration/order-status",
];

setup("every route is compiled before the tests", async ({ request }) => {
  setup.setTimeout(300_000);
  for (const path of WARM_UP) {
    await request.get(path, { maxRedirects: 0, timeout: 120_000 });
  }
  for (const path of WARM_UP_POST) {
    await request.post(path, { data: {}, timeout: 120_000 }); // 4xx is fine: only compiling
  }
});
