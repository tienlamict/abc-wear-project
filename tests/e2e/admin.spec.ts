import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type APIRequestContext,
  type Page,
  expect,
  request as playwrightRequest,
  test,
} from "@playwright/test";
import sharp from "sharp";
import { uniqueEmail } from "./helpers/members";
import { MAIN_URL, addToCartViaApi, formatVnd, placeOrderViaApi } from "./helpers/shop";

// AD-01 → AD-05 (spec §14): product management in the mock Main System's /admin, checked on the
// website. Needs MinIO (docker compose up -d). Tests run in order on one product they create.

const ADMIN = {
  username: process.env.MOCK_ADMIN_USER || "admin",
  password: process.env.MOCK_ADMIN_PASSWORD || "change-me",
};
const ADMIN_URL = `${MAIN_URL}/admin`;
const fixture = (name: string) => readFileSync(join(__dirname, "../fixtures", name));
const png = () => ({ name: "sample.png", mimeType: "image/png", buffer: fixture("sample.png") });
const jpg = () => ({ name: "sample.jpg", mimeType: "image/jpeg", buffer: fixture("sample.jpg") });

test.describe.configure({ mode: "serial" });
test.use({ httpCredentials: { ...ADMIN, origin: MAIN_URL } });

const NAME = `Áo khoác gió E2E ${Date.now()}`;
let productId = "";

/** Admin API with basic auth, for setup checks and cleanup. */
async function adminApi(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({
    baseURL: `${ADMIN_URL}/api/`,
    httpCredentials: { ...ADMIN, origin: MAIN_URL, send: "always" },
  });
}

async function productImages(): Promise<{ id: string; url: string }[]> {
  const api = await adminApi();
  const res = await api.get(`products/${productId}`);
  const images = (await res.json()).images;
  await api.dispose();
  return images;
}

/** Website search results for the test product (the card's image, price, …). */
const searchCard = (page: Page) =>
  page.getByTestId("product-card").filter({ has: page.getByText(NAME, { exact: true }) });

/** ≤ 10 s from saving in /admin to the website showing it (spec M6 DoD). */
async function expectOnWebsite(page: Page, path: string, check: () => Promise<void>) {
  await expect(async () => {
    await page.goto(path);
    await check();
  }).toPass({ timeout: 10_000, intervals: [500, 1000] });
}

test.afterAll(async () => {
  // Leave nothing for sale: stop the product and drop its images (MinIO objects included).
  if (!productId) return;
  const api = await adminApi();
  await api.post(`${MAIN_URL}/sim/catalog-webhook`, { data: { enabled: true } });
  await api.put(`products/${productId}`, { data: { isActive: false } });
  for (const image of (await (await api.get(`products/${productId}`)).json()).images ?? []) {
    await api.delete(`products/${productId}/images/${image.id}`);
  }
  await api.dispose();
});

test("AD-01 /admin is blocked without an account; with it the list can be searched and filtered", async ({
  page,
}) => {
  // Plain fetch: Playwright contexts would inherit the credentials from test.use().
  for (const path of ["/admin", "/admin/api/products"]) {
    expect((await fetch(`${MAIN_URL}${path}`)).status, path).toBe(401);
  }

  await page.goto(ADMIN_URL);
  const rows = page.getByRole("table", { name: "Danh sách sản phẩm" }).locator("tbody tr");
  await expect(rows.first()).toBeVisible();
  await expect(page.getByText(/^\d+ sản phẩm$/)).toBeVisible();

  await page.getByLabel("Tìm theo tên, mã, SKU").fill("P000007");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Áo thun thể thao nam");

  await page.getByLabel("Tìm theo tên, mã, SKU").fill("");
  await page.getByLabel("Danh mục").selectOption({ label: "— Váy đầm" });
  await expect(rows.first()).toContainText("Váy đầm");
  for (const text of await rows.locator("td:nth-child(4)").allTextContents()) {
    expect(text).toBe("Váy đầm");
  }
  await page.getByLabel("Trạng thái").selectOption("active");
  await expect(rows.locator(".badge.off")).toHaveCount(0);
});

test("AD-02 a new product with 2 variants shows on the website; a duplicate SKU is refused", async ({
  page,
}) => {
  await page.goto(`${ADMIN_URL}/products/new`);
  await page.getByLabel("Tên sản phẩm").fill(NAME);
  await page.getByLabel("Mô tả").fill("Áo khoác gió chống nước nhẹ, tạo bởi E2E.");
  await page.getByLabel("Danh mục").selectOption({ label: "Áo nữ" });
  await page.getByLabel("Size dòng 1").fill("M");
  await page.getByLabel("Màu dòng 1").fill("Đen");
  await page.getByLabel("Giá dòng 1").fill("399000");
  await page.getByLabel("Tồn kho dòng 1").fill("20");
  await page.getByRole("button", { name: "+ Thêm biến thể" }).click();
  await page.getByLabel("Size dòng 2").fill("L");
  await page.getByLabel("Màu dòng 2").fill("Đen");
  await page.getByLabel("Giá dòng 2").fill("419000");
  await page.getByLabel("Tồn kho dòng 2").fill("20");
  await page.getByRole("button", { name: "Lưu sản phẩm" }).click();

  await expect(page).toHaveURL(/\/admin\/products\/P\d{6}$/);
  productId = page.url().split("/").pop()!;
  await expect(page.getByText(`Đã thêm sản phẩm ${productId}`)).toBeVisible();
  await expect(page.getByLabel("Đồng bộ sang website")).toContainText("Đã đồng bộ sang website");
  await expect(page.getByText(`${productId}-M-DEN`, { exact: true })).toBeVisible();

  await expectOnWebsite(page, `/tim-kiem?q=${encodeURIComponent(NAME)}`, async () => {
    await expect(searchCard(page)).toHaveCount(1, { timeout: 1000 });
  });
  await expect(searchCard(page).getByTestId("price")).toHaveText(`Từ ${formatVnd(399000)}`);
  await searchCard(page).getByRole("link").first().click();
  await expect(page.getByRole("heading", { level: 1, name: NAME })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Đường dẫn" })).toContainText("Áo nữ");
  await expect(page.getByTestId("image-placeholder")).toBeVisible(); // no images yet

  // Duplicate SKU: nothing is saved.
  await page.goto(`${ADMIN_URL}/products/${productId}`);
  await page.getByRole("button", { name: "+ Thêm biến thể" }).click();
  await page.getByLabel("Size dòng 3").fill("XL");
  await page.getByLabel("Màu dòng 3").fill("Đen");
  await page.getByLabel("SKU dòng 3").fill("P000001-M-HONG");
  await page.getByLabel("Giá dòng 3").fill("429000");
  await page.getByLabel("Tồn kho dòng 3").fill("1");
  await page.getByRole("button", { name: "Lưu sản phẩm" }).click();
  await expect(
    page.getByText("SKU P000001-M-HONG đã tồn tại. Vui lòng dùng SKU khác."),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("table", { name: "Biến thể" }).locator("tbody tr")).toHaveCount(2);
});

test("AD-03 images: upload, rules, delete and reorder reach the website and MinIO", async ({
  page,
}) => {
  test.setTimeout(120_000);
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto(`${ADMIN_URL}/products/${productId}`);
  const uploads = page.getByRole("list", { name: "Kết quả tải ảnh" });

  await page.locator("#files").setInputFiles([jpg(), png()]);
  await expect(page.getByText("Đã tải lên 2 ảnh.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Ảnh đại diện", { exact: true })).toBeVisible();

  // Stored in MinIO as WebP, at most 1200 px.
  const images = await productImages();
  expect(images).toHaveLength(2);
  for (const image of images) {
    const res = await page.request.get(image.url);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/webp");
    const meta = await sharp(await res.body()).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(1200);
  }

  // On the website's product page: a large image plus 2 thumbnails.
  await expectOnWebsite(page, `/san-pham/${productId}`, async () => {
    await expect(page.getByRole("button", { name: /^Xem ảnh \d$/ })).toHaveCount(2, {
      timeout: 1000,
    });
  });
  await expect(page.getByTestId("gallery-main")).toHaveAttribute("src", new RegExp(images[0]!.id));

  // Rejected with a reason each: a PDF renamed .jpg, a file over 5 MB, the 9th image.
  const big = await sharp(randomBytes(1500 * 1500 * 3), {
    raw: { width: 1500, height: 1500, channels: 3 },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  await page.goto(`${ADMIN_URL}/products/${productId}`);
  await page
    .locator("#files")
    .setInputFiles([
      { name: "fake-image.jpg", mimeType: "image/jpeg", buffer: fixture("fake-image.jpg") },
      { name: "big.png", mimeType: "image/png", buffer: big },
      ...Array.from({ length: 7 }, (_, i) => ({ ...png(), name: `more-${i + 1}.png` })),
    ]);
  await expect(page.getByText("Đã tải lên 6 ảnh, 3 ảnh bị từ chối")).toBeVisible({
    timeout: 30_000,
  });
  await expect(uploads.locator("li").filter({ hasText: "fake-image.jpg" })).toContainText(
    "Chỉ nhận ảnh JPEG, PNG hoặc WebP",
  );
  await expect(uploads.locator("li").filter({ hasText: "big.png" })).toContainText(
    "File vượt quá 5 MB.",
  );
  await expect(uploads.locator("li").filter({ hasText: "more-7.png" })).toContainText(
    "tối đa 8 ảnh",
  );
  expect(await productImages()).toHaveLength(8);

  // Delete image 2: gone from MinIO and from the website.
  const before = await productImages();
  const removed = before[1]!;
  await page.getByRole("button", { name: "Xóa ảnh 2" }).click();
  await expect(page.getByText("Đã xóa ảnh.")).toBeVisible();
  expect((await page.request.get(removed.url)).status()).toBe(404);
  await expectOnWebsite(page, `/san-pham/${productId}`, async () => {
    await expect(page.getByRole("button", { name: /^Xem ảnh \d$/ })).toHaveCount(7, {
      timeout: 1000,
    });
  });
  expect(await page.locator(`img[src*="${removed.id}"]`).count()).toBe(0);

  // Reorder: image 2 moves first and becomes the card image on the website.
  await page.goto(`${ADMIN_URL}/products/${productId}`);
  const newFirst = (await productImages())[1]!;
  await page.getByRole("button", { name: "Đưa ảnh 2 lên trước" }).click();
  await expect(page.getByText("Đã đổi thứ tự ảnh.")).toBeVisible();
  expect((await productImages())[0]!.id).toBe(newFirst.id);
  await expectOnWebsite(page, `/tim-kiem?q=${encodeURIComponent(NAME)}`, async () => {
    await expect(searchCard(page).locator("img")).toHaveAttribute("src", new RegExp(newFirst.id), {
      timeout: 1000,
    });
  });
});

test("AD-04 stock to 0, new price (old orders keep theirs), stop selling", async ({ page }) => {
  test.setTimeout(90_000);
  // An order at the current price, before it changes.
  const email = uniqueEmail("admin");
  await addToCartViaApi(page, `${productId}-L-DEN`, 1);
  const code = await placeOrderViaApi(page, email);

  await page.goto(`${ADMIN_URL}/products/${productId}`);
  await page.getByLabel(`Tồn kho ${productId}-M-DEN`).fill("0");
  await page
    .getByRole("row", { name: new RegExp(`${productId}-M-DEN`) })
    .getByRole("button", { name: "Lưu nhanh" })
    .click();
  await expect(page.getByText(`Đã lưu ${productId}-M-DEN`)).toBeVisible();
  await expect(page.getByLabel("Đồng bộ sang website")).toContainText(
    "Đã đồng bộ tồn kho sang website",
  );

  await page.getByLabel(`Giá ${productId}-L-DEN`).fill("459000");
  await page
    .getByRole("row", { name: new RegExp(`${productId}-L-DEN`) })
    .getByRole("button", { name: "Lưu nhanh" })
    .click();
  await expect(page.getByText(`Đã lưu ${productId}-L-DEN`)).toBeVisible();

  await expectOnWebsite(page, `/san-pham/${productId}`, async () => {
    const sizes = page.getByRole("group", { name: "Kích cỡ" });
    await sizes.getByRole("button", { name: /^M\b/ }).click({ timeout: 1000 });
    await expect(page.getByText("Tạm hết hàng", { exact: true })).toBeVisible({ timeout: 1000 });
    await sizes.getByRole("button", { name: /^L\b/ }).click({ timeout: 1000 });
    await expect(page.getByRole("main")).toContainText(formatVnd(459000), { timeout: 1000 });
  });

  const lookup = await page.request.post("/api/orders/lookup", { data: { code, email } });
  expect(lookup.ok()).toBe(true);
  const order = await lookup.json();
  expect(order.items[0]).toMatchObject({ sku: `${productId}-L-DEN`, unitPrice: 419000 });

  // Stop selling: the product leaves the website's listings.
  await page.goto(`${ADMIN_URL}/products/${productId}`);
  await page.getByLabel("Đang bán").uncheck();
  await page.getByRole("button", { name: "Lưu sản phẩm" }).click();
  await expect(page.getByText("Đã lưu sản phẩm.")).toBeVisible();
  await expectOnWebsite(page, `/tim-kiem?q=${encodeURIComponent(NAME)}`, async () => {
    await expect(searchCard(page)).toHaveCount(0, { timeout: 1000 });
  });
  await page.goto(`/san-pham/${productId}`);
  await expect(page.getByText("Sản phẩm này tạm ngừng kinh doanh.")).toBeVisible();

  await page.goto(ADMIN_URL);
  await page.getByLabel("Tìm theo tên, mã, SKU").fill(productId);
  const row = page.getByRole("row", { name: new RegExp(productId) });
  await expect(row.locator(".badge")).toHaveText("Ngừng bán");
  await row.getByRole("button", { name: "Mở bán" }).click();
  await expect(row.locator(".badge")).toHaveText("Đang bán");
});

test("AD-05 'Đồng bộ ngay', and a website that cannot be reached", async ({ page, request }) => {
  test.setTimeout(120_000);
  await page.goto(ADMIN_URL);
  await page.getByRole("button", { name: "Đồng bộ ngay" }).click();
  await expect(page.getByLabel("Kết quả đồng bộ gần nhất")).toContainText(
    "Đã đồng bộ sang website",
  );

  // "Website down": the webhook fails, the change stays in Main.
  await request.post(`${MAIN_URL}/sim/catalog-webhook`, { data: { enabled: false } });
  try {
    await page.goto(`${ADMIN_URL}/products/${productId}`);
    await page.getByLabel(`Giá ${productId}-L-DEN`).fill("479000");
    await page
      .getByRole("row", { name: new RegExp(`${productId}-L-DEN`) })
      .getByRole("button", { name: "Lưu nhanh" })
      .click();
    await expect(page.getByLabel("Đồng bộ sang website")).toContainText(
      "Chưa đồng bộ được sang website",
    );
    await page.reload();
    await expect(page.getByLabel(`Giá ${productId}-L-DEN`)).toHaveValue("479000");

    await page.goto(`/san-pham/${productId}`);
    await page
      .getByRole("group", { name: "Kích cỡ" })
      .getByRole("button", { name: /^L\b/ })
      .click();
    await expect(page.getByRole("main")).toContainText(formatVnd(459000));
  } finally {
    await request.post(`${MAIN_URL}/sim/catalog-webhook`, { data: { enabled: true } });
  }

  // "Website back": the worker's periodic IF-01 run (the same code as `pnpm sync`) catches up.
  execSync("pnpm sync", { stdio: "pipe" });
  await page.goto(`/san-pham/${productId}`);
  await page.getByRole("group", { name: "Kích cỡ" }).getByRole("button", { name: /^L\b/ }).click();
  await expect(page.getByRole("main")).toContainText(formatVnd(479000));
});
