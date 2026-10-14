import { type APIRequestContext, type Page, expect } from "@playwright/test";

export const MAIN_URL = process.env.MAIN_SYSTEM_URL ?? "http://localhost:4100";

export interface LiveVariant {
  productId: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  price: number;
  availableQty: number;
  purchasable: boolean;
}

/**
 * First variant (scanning P001…P040 from `start`) matching the predicate, read live from the
 * API: stock moves as E2E orders reach the mock, so tests never hard-code quantities.
 */
export async function findVariant(
  request: APIRequestContext,
  predicate: (v: LiveVariant) => boolean,
  start = 1,
): Promise<LiveVariant> {
  for (let n = start; n <= 40; n++) {
    const id = `P${String(n).padStart(3, "0")}`;
    const res = await request.get(`/api/products/${id}`);
    if (!res.ok()) continue;
    const product = await res.json();
    if (!product.isActive) continue;
    for (const v of product.variants) {
      const live = { ...v, productId: id, productName: product.name } as LiveVariant;
      if (predicate(live)) return live;
    }
  }
  throw new Error("no variant matches the predicate in the current data");
}

/** Adds through the API with the page's cookies (creates the guest `sid` if needed). */
export async function addToCartViaApi(page: Page, sku: string, quantity: number) {
  const res = await page.request.post("/api/cart/items", { data: { sku, quantity } });
  expect(res.ok(), await res.text()).toBe(true);
}

/** Picks a color and size on the product page. */
export async function chooseVariant(page: Page, v: LiveVariant) {
  await page.goto(`/san-pham/${v.productId}`);
  await page.getByRole("group", { name: "Màu sắc" }).getByRole("button", { name: v.color }).click();
  await page
    .getByRole("group", { name: "Kích cỡ" })
    .getByRole("button", { name: new RegExp(`^${v.size}\\b`) })
    .click();
}

export const cartCount = (page: Page) => page.getByTestId("cart-count");

/** "1.234.000 ₫" → 1234000 */
export const parseVnd = (text: string) => Number(text.replace(/[^\d]/g, ""));

export const formatVnd = (n: number) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} ₫`;

export interface MockOrder {
  mainOrderId: string;
  deliveries: number;
  payload: { code: string; codAmount: number; shippingAddress: { line1: string } };
}

export async function mockOrderByCode(
  request: APIRequestContext,
  code: string,
): Promise<MockOrder | undefined> {
  const res = await request.get(`${MAIN_URL}/sim/orders`);
  const { orders } = (await res.json()) as { orders: MockOrder[] };
  return orders.find((o) => o.payload.code === code);
}

export const ADDRESS = {
  customerName: "Nguyễn Thị Lan",
  customerPhone: "0987 654 321",
  shipLine1: "25 Trần Hưng Đạo",
  shipWard: "Phường Phạm Ngũ Lão",
  shipDistrict: "Quận 1",
  shipProvince: "TP. Hồ Chí Minh",
};

/** Step 1 of /dat-hang. */
export async function fillCheckoutDetails(page: Page, email: string) {
  const form = page.getByRole("form", { name: "Thông tin giao hàng" });
  await form.getByLabel("Họ tên người nhận").fill(ADDRESS.customerName);
  await form.getByLabel("Số điện thoại").fill(ADDRESS.customerPhone);
  await form.getByLabel("Email nhận xác nhận đơn").fill(email);
  await form.getByLabel("Số nhà, tên đường").fill(ADDRESS.shipLine1);
  await form.getByLabel("Phường/Xã").fill(ADDRESS.shipWard);
  await form.getByLabel("Quận/Huyện").fill(ADDRESS.shipDistrict);
  await form.getByLabel("Tỉnh/Thành phố").fill(ADDRESS.shipProvince);
}
