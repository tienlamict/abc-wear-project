import { type Page, expect, test } from "@playwright/test";
import { waitForEmail } from "./helpers/mailpit";
import { registerViaApi, uniqueEmail } from "./helpers/members";
import {
  addToCartViaApi,
  advanceInMain,
  chooseVariant,
  findVariant,
  mockOrderByCode,
  placeOrderViaApi,
  setFailMode,
  setMainStock,
  waitForMainOrder,
} from "./helpers/shop";

async function lookup(page: Page, code: string, email: string) {
  await page.goto("/tra-cuu-don");
  const form = page.getByRole("form", { name: "Tra cứu đơn hàng" });
  await form.getByLabel("Mã đơn hàng").fill(code);
  await form.getByLabel("Email đặt hàng").fill(email);
  await form.getByRole("button", { name: "Tra cứu" }).click();
}

test("OD-05 + IN-02 a status change in Main reaches the lookup page and the customer's inbox", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("track");
  const v = await findVariant(request, (x) => x.purchasable && x.availableQty >= 5, 3);
  await addToCartViaApi(page, v.sku, 1);
  const code = await placeOrderViaApi(page, email);
  const { mainOrderId } = await waitForMainOrder(request, code);

  await lookup(page, code, email);
  const detail = page.getByRole("article", { name: `Đơn hàng ${code}` });
  await expect(detail.getByTestId("order-status")).toHaveText("Đã chuyển kho");

  await advanceInMain(request, mainOrderId); // PICKING
  await lookup(page, code, email);
  await expect(detail.getByTestId("order-status")).toHaveText("Đang chuẩn bị hàng");
  await expect(detail.locator("[data-testid=timeline-step][data-state=current]")).toHaveText(
    /Đang chuẩn bị hàng/,
  );

  const shipping = await advanceInMain(request, mainOrderId); // SHIPPING
  await lookup(page, code.toLowerCase(), email.toUpperCase()); // case does not matter
  await expect(detail.getByTestId("order-status")).toHaveText("Đang giao hàng");
  await expect(detail.getByTestId("tracking-number")).toHaveText(shipping.trackingNumber!);

  const mail = await waitForEmail(request, email, "đang được giao");
  expect(mail.Text).toContain(shipping.trackingNumber!);
  expect(mail.Text).toContain(`tra-cuu-don?code=${code}`);

  // Re-sending the same status changes nothing (idempotent).
  await advanceInMain(request, mainOrderId, "SHIPPING");
  await advanceInMain(request, mainOrderId); // DELIVERED
  await lookup(page, code, email);
  await expect(detail.getByTestId("order-status")).toHaveText("Đã giao hàng");
  await waitForEmail(request, email, "đã giao thành công");
});

test("OD-05 a wrong email or code says the order was not found", async ({ page, request }) => {
  const email = uniqueEmail("lookup");
  const v = await findVariant(request, (x) => x.purchasable && x.availableQty >= 5, 4);
  await addToCartViaApi(page, v.sku, 1);
  const code = await placeOrderViaApi(page, email);

  await lookup(page, code, "nguoi-khac@example.com");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Không tìm thấy đơn");
  await expect(page.getByRole("article")).toHaveCount(0);

  await lookup(page, "ABC-000000-AAAAA", email);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Không tìm thấy đơn");

  // The email link pre-fills the code.
  await page.goto(`/tra-cuu-don?code=${code}`);
  await expect(page.getByLabel("Mã đơn hàng")).toHaveValue(code);
});

test("OD-06 members see only their own orders, newest first", async ({
  page,
  browser,
  request,
}) => {
  const emailA = uniqueEmail("owner-a");
  await registerViaApi(page, { email: emailA, fullName: "Chủ Đơn A" });
  const v = await findVariant(request, (x) => x.purchasable && x.availableQty >= 5, 6);
  await addToCartViaApi(page, v.sku, 1);
  const first = await placeOrderViaApi(page, emailA);
  await addToCartViaApi(page, v.sku, 2);
  const second = await placeOrderViaApi(page, emailA);

  await page.goto("/tai-khoan");
  await page.getByRole("link", { name: "Đơn hàng của tôi" }).click();
  await expect(page).toHaveURL(/\/tai-khoan\/don-hang$/);
  const rows = page.getByTestId("order-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute("data-code", second);
  await expect(rows.nth(1)).toHaveAttribute("data-code", first);

  await rows.nth(1).getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/tai-khoan/don-hang/${first}$`));
  await expect(page.getByTestId("detail-code")).toHaveText(first);
  await expect(page.getByLabel("Dòng thời gian trạng thái")).toContainText("Đã xác nhận");

  // Member B cannot open A's order, through the page or the API.
  const other = await browser.newContext();
  const pageB = await other.newPage();
  await registerViaApi(pageB, { email: uniqueEmail("owner-b"), fullName: "Người B" });
  const res = await pageB.goto(`/tai-khoan/don-hang/${first}`);
  expect(res?.status()).toBe(404);
  await expect(pageB.getByRole("heading", { name: "Không tìm thấy đơn" })).toBeVisible();
  const api = await pageB.request.get(`/api/orders/${first}`);
  expect(api.status()).toBe(404);
  const list = await (await pageB.request.get("/api/orders")).json();
  expect(list.total).toBe(0);
  await other.close();

  // Signed out: the order list asks for sign-in.
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto("/tai-khoan/don-hang");
  await expect(anonPage).toHaveURL(/\/dang-nhap\?next=%2Ftai-khoan%2Fdon-hang$/);
  await anon.close();
});

test("IN-02 a temporary Main outage is retried; Main gets the order exactly once", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("retry");
  const v = await findVariant(request, (x) => x.purchasable && x.availableQty >= 5, 8);
  await addToCartViaApi(page, v.sku, 1);
  // Only IF-04 fails, once: the checkout's IF-03 call still goes through.
  await setFailMode(request, { mode: "error", count: 1, only: "/main/orders" });
  try {
    const code = await placeOrderViaApi(page, email);
    // First attempt fails, the retry comes 10 s later (worker ticks every 5 s).
    const order = await waitForMainOrder(request, code, 30_000);
    expect(order.deliveries).toBe(1);
    await lookup(page, code, email);
    await expect(page.getByTestId("order-status")).toHaveText("Đã chuyển kho");
    expect((await mockOrderByCode(request, code))!.deliveries).toBe(1);
  } finally {
    await setFailMode(request, { mode: "none" });
  }
});

test("IN-01 a stock change in Main shows on the website within a minute", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const v = await findVariant(request, (x) => x.purchasable && x.availableQty >= 8, 12);
  const target = 3;
  await setMainStock(request, v.sku, target);
  try {
    await expect
      .poll(
        async () => {
          await chooseVariant(page, v);
          return page.getByText(`Chỉ còn ${target} sản phẩm`).isVisible();
        },
        { timeout: 75_000, intervals: [5_000], message: "IF-02 did not bring the new stock" },
      )
      .toBe(true);
  } finally {
    await setMainStock(request, v.sku, v.availableQty);
  }
});
