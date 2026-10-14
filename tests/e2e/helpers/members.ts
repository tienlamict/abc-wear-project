import { type Page, expect } from "@playwright/test";

/** Fresh address per test; the dev database keeps accumulating these, which is fine. */
export function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@e2e.abcwear.test`;
}

export const TEST_PASSWORD = "MatKhau-e2e-1";

/** Registers through the API with the page's cookies, so the browser is signed in afterwards. */
export async function registerViaApi(
  page: Page,
  member: { email: string; fullName?: string; password?: string },
) {
  const res = await page.request.post("/api/auth/register", {
    data: {
      email: member.email,
      fullName: member.fullName ?? "Khách E2E",
      password: member.password ?? TEST_PASSWORD,
    },
  });
  expect(res.status()).toBe(201);
}

export async function loginViaForm(page: Page, email: string, password: string) {
  const form = page.getByRole("form", { name: "Đăng nhập" });
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Mật khẩu").fill(password);
  await form.getByRole("button", { name: "Đăng nhập" }).click();
}
