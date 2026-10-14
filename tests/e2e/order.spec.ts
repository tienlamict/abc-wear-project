import { expect, test } from "@playwright/test";
import { waitForEmail } from "./helpers/mailpit";
import { TEST_PASSWORD, loginViaForm, registerViaApi, uniqueEmail } from "./helpers/members";
import {
  ADDRESS,
  addToCartViaApi,
  cartCount,
  chooseVariant,
  fillCheckoutDetails,
  findVariant,
  formatVnd,
  mockOrderByCode,
  parseVnd,
} from "./helpers/shop";

test.describe("OD-01 cart", () => {
  test("guest adds from the product page, changes quantity and removes", async ({
    page,
    request,
  }) => {
    const v = await findVariant(request, (x) => x.purchasable && x.availableQty >= 5);
    await chooseVariant(page, v);
    await page.getByLabel("Số lượng").selectOption("2");
    await page.getByRole("button", { name: "Thêm vào giỏ" }).click();
    await expect(page.getByRole("main").getByRole("status")).toContainText(
      "Đã thêm 2 sản phẩm vào giỏ hàng",
    );
    await expect(cartCount(page)).toHaveText("2");

    await page.getByRole("main").getByRole("link", { name: "Xem giỏ hàng" }).click();
    await expect(page).toHaveURL(/\/gio-hang$/);
    const line = page.locator(`[data-testid=cart-line][data-sku="${v.sku}"]`);
    await expect(line).toContainText(v.productName);
    await expect(line.getByTestId("line-total")).toHaveText(formatVnd(2 * v.price));

    await line.getByRole("combobox").selectOption("3");
    await expect(line.getByTestId("line-total")).toHaveText(formatVnd(3 * v.price));
    await expect(cartCount(page)).toHaveText("3");
    await expect(page.getByTestId("items-total")).toHaveText(formatVnd(3 * v.price));

    await line.getByRole("button", { name: "Xóa" }).click();
    await expect(page.getByText("Giỏ hàng đang trống.")).toBeVisible();
    await expect(cartCount(page)).toHaveText("0");
  });

  test("adding more than the stock or more than 10 shows a clear error", async ({
    page,
    request,
  }) => {
    const low = await findVariant(
      request,
      (x) => x.purchasable && x.availableQty >= 1 && x.availableQty <= 9,
    );
    await chooseVariant(page, low);
    await page.getByLabel("Số lượng").selectOption(String(low.availableQty + 1));
    await page.getByRole("button", { name: "Thêm vào giỏ" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      `Sản phẩm này chỉ còn ${low.availableQty}. Vui lòng giảm số lượng.`,
    );
    await expect(cartCount(page)).toHaveText("0");

    const plenty = await findVariant(request, (x) => x.purchasable && x.availableQty >= 12);
    await chooseVariant(page, plenty);
    await page.getByLabel("Số lượng").selectOption("10");
    await page.getByRole("button", { name: "Thêm vào giỏ" }).click();
    await expect(cartCount(page)).toHaveText("10");
    await page.getByLabel("Số lượng").selectOption("1");
    await page.getByRole("button", { name: "Thêm vào giỏ" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "Mỗi sản phẩm tối đa 10 trong một đơn hàng. Giỏ hàng đã có 10.",
    );
    await expect(cartCount(page)).toHaveText("10");
  });

  test("QT10 signing in merges the guest cart into the member cart", async ({ page, request }) => {
    const email = uniqueEmail("merge");
    await registerViaApi(page, { email, fullName: "Khách Gộp Giỏ" });
    const [a, b] = [
      await findVariant(request, (x) => x.purchasable && x.availableQty >= 5),
      await findVariant(request, (x) => x.purchasable && x.availableQty >= 5, 10),
    ];
    await addToCartViaApi(page, a.sku, 2); // member cart
    await page.request.post("/api/auth/logout");

    await addToCartViaApi(page, a.sku, 1); // guest cart (same browser, now signed out)
    await addToCartViaApi(page, b.sku, 1);
    await page.goto("/dang-nhap?next=/gio-hang");
    await expect(cartCount(page)).toHaveText("2");
    await loginViaForm(page, email, TEST_PASSWORD);

    await expect(page).toHaveURL(/\/gio-hang$/);
    await expect(cartCount(page)).toHaveText("4");
    await expect(
      page.locator(`[data-testid=cart-line][data-sku="${a.sku}"]`).getByRole("combobox"),
    ).toHaveValue("3");
    await expect(page.locator(`[data-testid=cart-line][data-sku="${b.sku}"]`)).toBeVisible();
  });
});

test.describe("OD-02 → OD-04 checkout", () => {
  test("guest checks out in 3 steps; COD = items + fee; email; order reaches Main ≤ 10 s", async ({
    page,
    request,
    browser,
  }) => {
    const email = uniqueEmail("guest-order");
    const a = await findVariant(request, (x) => x.purchasable && x.availableQty >= 5);
    const b = await findVariant(request, (x) => x.purchasable && x.availableQty >= 5, 20);
    await addToCartViaApi(page, a.sku, 2);
    await addToCartViaApi(page, b.sku, 1);
    const itemsTotal = 2 * a.price + b.price;

    await page.goto("/gio-hang");
    await page.getByRole("link", { name: "Tiến hành đặt hàng" }).click();
    await expect(page).toHaveURL(/\/dat-hang$/);

    // Step 1: missing fields are reported before moving on.
    await page.getByRole("button", { name: "Tiếp tục" }).click();
    await expect(page.getByText("Vui lòng nhập họ tên")).toBeVisible();
    await expect(page.getByText("Vui lòng nhập tỉnh/thành phố")).toBeVisible();
    await fillCheckoutDetails(page, email);
    await page.getByRole("button", { name: "Tiếp tục" }).click();

    // Step 2: OD-03 the COD total follows the shipping method.
    await expect(page.getByTestId("summary-items-total")).toHaveText(formatVnd(itemsTotal));
    await expect(page.getByTestId("summary-cod")).toHaveText(formatVnd(itemsTotal + 30_000));
    await page.getByLabel(/Nhanh/).check();
    await expect(page.getByTestId("summary-shipping-fee")).toHaveText(formatVnd(50_000));
    await expect(page.getByTestId("summary-cod")).toHaveText(formatVnd(itemsTotal + 50_000));
    await page.getByRole("button", { name: "Tiếp tục" }).click();

    // Step 3: review and place.
    await expect(page.getByRole("region", { name: "Giao đến" })).toContainText(ADDRESS.shipLine1);
    await expect(page.getByRole("region", { name: "Sản phẩm" })).toContainText(a.productName);
    await page.getByRole("button", { name: "Đặt hàng" }).click();

    await expect(page).toHaveURL(/\/dat-hang\/hoan-tat\/ABC-\d{6}-[A-Z0-9]{5}$/);
    const code = (await page.getByTestId("order-code").textContent())!.trim();
    await expect(page.getByTestId("cod-amount")).toHaveText(formatVnd(itemsTotal + 50_000));
    await expect(cartCount(page)).toHaveText("0");

    // OD-04: confirmation email with code, items and COD total.
    const mail = await waitForEmail(request, email, code);
    expect(mail.Text).toContain(code);
    expect(mail.Text).toContain(a.productName);
    expect(mail.Text).toContain(b.productName);
    expect(mail.Text).toContain(`(COD): ${formatVnd(itemsTotal + 50_000)}`);
    expect(mail.Text).toContain("Tra cứu đơn hàng: http://localhost:3000/tra-cuu-don");

    // DoD M4: the worker sends it to Main System within 10 seconds (polls every 5 s).
    await expect
      .poll(async () => (await mockOrderByCode(request, code))?.payload.codAmount, {
        timeout: 12_000,
        intervals: [500],
      })
      .toBe(itemsTotal + 50_000);
    expect((await mockOrderByCode(request, code))!.deliveries).toBe(1);

    // Only the buyer sees the thank-you page.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto(`/dat-hang/hoan-tat/${code}`);
    await expect(otherPage.getByRole("heading", { name: "Không tìm thấy đơn" })).toBeVisible();
    await other.close();
  });

  test("member checkout is prefilled from the profile (MA-04) and keeps its address snapshot", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail("member-order");
    await registerViaApi(page, { email, fullName: "Đỗ Minh Quân" });
    const profile = await page.request.patch("/api/me", {
      data: {
        phone: "0912 000 111",
        shipLine1: "8 Hai Bà Trưng",
        shipWard: "Phường Tràng Tiền",
        shipDistrict: "Quận Hoàn Kiếm",
        shipProvince: "Hà Nội",
      },
    });
    expect(profile.ok()).toBe(true);
    const v = await findVariant(request, (x) => x.purchasable && x.availableQty >= 5, 5);
    await addToCartViaApi(page, v.sku, 1);

    await page.goto("/dat-hang");
    const form = page.getByRole("form", { name: "Thông tin giao hàng" });
    await expect(form.getByLabel("Họ tên người nhận")).toHaveValue("Đỗ Minh Quân");
    await expect(form.getByLabel("Số điện thoại")).toHaveValue("0912000111");
    await expect(form.getByLabel("Email nhận xác nhận đơn")).toHaveValue(email);
    await expect(form.getByLabel("Số nhà, tên đường")).toHaveValue("8 Hai Bà Trưng");
    await expect(form.getByLabel("Tỉnh/Thành phố")).toHaveValue("Hà Nội");
    await page.getByRole("button", { name: "Tiếp tục" }).click();
    await page.getByRole("button", { name: "Tiếp tục" }).click();
    await page.getByRole("button", { name: "Đặt hàng" }).click();

    await expect(page).toHaveURL(/\/dat-hang\/hoan-tat\//);
    const code = (await page.getByTestId("order-code").textContent())!.trim();
    expect(parseVnd((await page.getByTestId("cod-amount").textContent())!)).toBe(v.price + 30_000);

    // OD-02: editing the profile later does not change the order sent to Main.
    await page.request.patch("/api/me", { data: { shipLine1: "1 Phố Mới" } });
    await expect
      .poll(async () => (await mockOrderByCode(request, code))?.payload.shippingAddress.line1, {
        timeout: 12_000,
        intervals: [500],
      })
      .toBe("8 Hai Bà Trưng");
  });

  test("an empty cart cannot be checked out", async ({ page }) => {
    await page.goto("/dat-hang");
    await expect(page.getByText("Giỏ hàng đang trống")).toBeVisible();
    const res = await page.request.post("/api/orders", {
      headers: { "idempotency-key": crypto.randomUUID() },
      data: { ...ADDRESS, customerEmail: "a@b.vn", shippingMethod: "STANDARD" },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe("CART_EMPTY");
  });
});
