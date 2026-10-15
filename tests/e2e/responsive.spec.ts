import { expect, test } from "@playwright/test";
import { registerViaApi, uniqueEmail } from "./helpers/members";
import { addToCartViaApi, findVariant } from "./helpers/shop";

// M6: every screen works at 375 px wide (no sideways scrolling) and shows a heading.
test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

const PUBLIC_PAGES = [
  "/",
  "/danh-muc/nam",
  "/danh-muc/ao-thun-nam?size=M&sort=price_asc",
  "/tim-kiem?q=ao%20thun",
  "/tim-kiem?q=khongcosanphamnay",
  "/san-pham/P001",
  "/gio-hang",
  "/dat-hang",
  "/tra-cuu-don",
  "/dang-nhap",
  "/dang-ky",
  "/quen-mat-khau",
  "/dat-lai-mat-khau",
  "/khong-ton-tai",
];

async function expectNoHorizontalScroll(page: import("@playwright/test").Page, url: string) {
  await page.goto(url);
  await expect(page.locator("h1").first()).toBeVisible();
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `${url} scrolls sideways`).toBeLessThanOrEqual(innerWidth);
}

test("public pages fit 375 px", async ({ page }) => {
  for (const url of PUBLIC_PAGES) await expectNoHorizontalScroll(page, url);
});

test("cart, checkout and account pages fit 375 px", async ({ page, request }) => {
  await registerViaApi(page, {
    email: uniqueEmail("mobile"),
    fullName: "Nguyễn Thị Thu Hương Dài Tên",
  });
  const v = await findVariant(request, (x) => x.purchasable && x.availableQty >= 5, 2);
  await addToCartViaApi(page, v.sku, 2);
  for (const url of ["/gio-hang", "/dat-hang", "/tai-khoan", "/tai-khoan/don-hang"]) {
    await expectNoHorizontalScroll(page, url);
  }

  // The category menu folds into a button on phones.
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Danh mục sản phẩm" })).toBeHidden();
  await page.getByRole("button", { name: /Danh mục/ }).click();
  await expect(page.getByRole("navigation", { name: "Danh mục" })).toBeVisible();
});
