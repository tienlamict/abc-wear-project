import { type APIRequestContext, type Page, expect, test } from "@playwright/test";

interface Variant {
  sku: string;
  size: string;
  color: string;
  price: number;
  purchasable: boolean;
}

async function productVariants(request: APIRequestContext, id: string): Promise<Variant[]> {
  const res = await request.get(`/api/products/${id}`);
  expect(res.ok()).toBe(true);
  return (await res.json()).variants;
}

async function apiTotal(request: APIRequestContext, query: string): Promise<number> {
  const res = await request.get(`/api/products?${query}`);
  expect(res.ok()).toBe(true);
  return (await res.json()).total;
}

async function cardProductIds(page: Page): Promise<string[]> {
  const hrefs = await page
    .getByTestId("product-card")
    .locator("a")
    .evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
  return [...new Set(hrefs.map((h) => h.replace("/san-pham/", "")))];
}

test("PS-01 searching 'ao thun' without accents finds 'Áo thun …' products", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox", { name: "Từ khóa tìm kiếm" }).fill("ao thun");
  await page.getByRole("searchbox", { name: "Từ khóa tìm kiếm" }).press("Enter");

  await expect(page).toHaveURL(/\/tim-kiem\?q=ao\+thun/);
  await expect(page.getByTestId("search-term")).toHaveText("ao thun");
  const names = await page.getByTestId("product-name").allTextContents();
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) expect(name.toLowerCase()).toContain("áo thun");
});

test("PS-02 size + price filter keeps only matching products; price sort is ordered", async ({
  page,
  request,
}) => {
  const [minPrice, maxPrice] = [200_000, 350_000];
  await page.goto("/danh-muc/nam");

  const panel = page.getByRole("form", { name: "Bộ lọc sản phẩm" });
  await panel.getByRole("group", { name: "Kích cỡ" }).getByText("M", { exact: true }).click();
  await panel.getByLabel("Giá từ").fill(String(minPrice));
  await panel.getByLabel("Giá đến").fill(String(maxPrice));
  await panel.getByRole("button", { name: "Áp dụng" }).click();

  await expect(page).toHaveURL(/size=M/);
  await expect(page).toHaveURL(/minPrice=200000/);
  await expect(page).toHaveURL(/maxPrice=350000/);
  const expected = await apiTotal(
    request,
    `category=nam&size=M&minPrice=${minPrice}&maxPrice=${maxPrice}`,
  );
  expect(expected).toBeGreaterThan(0);
  await expect(page.getByTestId("result-count")).toHaveText(`${expected} sản phẩm`);

  const ids = await cardProductIds(page);
  expect(ids).toHaveLength(Math.min(expected, 24));
  for (const id of ids) {
    const variants = await productVariants(request, id);
    expect(
      variants.some((v) => v.size === "M" && v.price >= minPrice && v.price <= maxPrice),
      `${id} has a size M variant in range`,
    ).toBe(true);
  }

  // Sorting keeps the filters.
  await page.getByRole("combobox", { name: "Sắp xếp" }).selectOption("price_asc");
  await expect(page).toHaveURL(/sort=price_asc/);
  await expect(page).toHaveURL(/size=M/);
  await expect(page.getByTestId("result-count")).toHaveText(`${expected} sản phẩm`);
  const prices = (
    await page
      .getByTestId("product-card")
      .getByTestId("price")
      .evaluateAll((els) => els.map((el) => Number(el.getAttribute("data-price"))))
  ).filter((p) => p > 0);
  expect(prices.length).toBe(ids.length);
  expect(prices).toEqual([...prices].sort((a, b) => a - b));

  await page.getByRole("combobox", { name: "Sắp xếp" }).selectOption("price_desc");
  await expect(page).toHaveURL(/sort=price_desc/);
  await expect
    .poll(async () => {
      const desc = await page
        .getByTestId("product-card")
        .getByTestId("price")
        .evaluateAll((els) => els.map((el) => Number(el.getAttribute("data-price"))));
      return desc.every((p, i) => i === 0 || desc[i - 1]! >= p);
    })
    .toBe(true);
});

test("PS-03 a parent category shows products of all its subcategories", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Danh mục sản phẩm" })
    .getByRole("link", {
      name: "Nam",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/danh-muc\/nam$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nam");

  const [parent, shirts, trousers] = await Promise.all([
    apiTotal(request, "category=nam"),
    apiTotal(request, "category=ao-thun-nam"),
    apiTotal(request, "category=quan-nam"),
  ]);
  expect(parent).toBe(shirts + trousers);
  await expect(page.getByTestId("result-count")).toHaveText(`${parent} sản phẩm`);

  const names = await page.getByTestId("product-name").allTextContents();
  expect(names.some((n) => n.startsWith("Áo thun"))).toBe(true);
  expect(names.some((n) => n.startsWith("Quần"))).toBe(true);

  // A subcategory link narrows the list.
  await page.getByRole("main").getByRole("link", { name: "Quần nam" }).click();
  await expect(page).toHaveURL(/\/danh-muc\/quan-nam$/);
  await expect(page.getByTestId("result-count")).toHaveText(`${trousers} sản phẩm`);
});

test("PS-04 an out-of-stock variant locks 'Thêm vào giỏ' and shows 'Tạm hết hàng'", async ({
  page,
  request,
}) => {
  // P000001 has sold-out and in-stock variants in the seed; read the live state to pick them.
  const variants = await productVariants(request, "P000001");
  const soldOut = variants.find((v) => !v.purchasable);
  const inStock = variants.find((v) => v.purchasable);
  test.skip(!soldOut || !inStock, "P000001 needs one sold-out and one in-stock variant");

  await page.goto("/san-pham/P000001");
  const addToCart = page.getByRole("button", { name: "Thêm vào giỏ" });
  const sizeButton = (size: string) =>
    page.getByRole("group", { name: "Kích cỡ" }).getByRole("button", {
      name: new RegExp(`^${size}\\b`),
    });

  await page
    .getByRole("group", { name: "Màu sắc" })
    .getByRole("button", { name: soldOut!.color })
    .click();
  await sizeButton(soldOut!.size).click();
  await expect(sizeButton(soldOut!.size)).toHaveAttribute("aria-pressed", "true");
  await expect(addToCart).toBeDisabled();
  await expect(page.getByText("Tạm hết hàng", { exact: true })).toBeVisible();

  await page
    .getByRole("group", { name: "Màu sắc" })
    .getByRole("button", { name: inStock!.color })
    .click();
  await sizeButton(inStock!.size).click();
  await expect(addToCart).toBeEnabled();
  await expect(page.getByText("Tạm hết hàng", { exact: true })).toHaveCount(0);
});

test("PS-04 a product with no stock at all cannot be added", async ({ page, request }) => {
  const variants = await productVariants(request, "P000007");
  test.skip(
    variants.some((v) => v.purchasable),
    "P000007 is expected to be sold out",
  );

  await page.goto("/san-pham/P000007");
  await expect(page.getByRole("button", { name: "Thêm vào giỏ" })).toBeDisabled();
  await expect(page.getByText("Tạm hết hàng", { exact: true })).toBeVisible();
});

test("unknown product shows a Vietnamese not-found page", async ({ page }) => {
  const res = await page.goto("/san-pham/KHONG-CO");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Không tìm thấy trang" })).toBeVisible();
});
