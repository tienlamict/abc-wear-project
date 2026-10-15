// NF-01 load test: 100 virtual users for 2 minutes; every request must answer in < 2 s and
// fewer than 1% may fail. Mix per iteration: search 40%, product detail 30%, login 20%, order 10%.
//
// Run against a production build (`pnpm build && pnpm start:all`), not `pnpm dev`:
//   pnpm test:load            (k6 in Docker, see package.json)
// Env: BASE_URL (default http://host.docker.internal:3000), MEMBERS (login pool size, default 20).
import { check, group, sleep } from "k6";
import http from "k6/http";

const BASE_URL = (__ENV.BASE_URL || "http://host.docker.internal:3000").replace(/\/+$/, "");
const MEMBERS = Number(__ENV.MEMBERS || 20);
const PASSWORD = "LoadTest-12345";

export const options = {
  scenarios: {
    // 100 users for the full 2 minutes, after a 30 s ramp so they do not all fire at t=0.
    shoppers: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 100 },
        { duration: "2m", target: 100 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_duration: ["max<2000"],
    http_req_failed: ["rate<0.01"],
    "http_req_duration{flow:search}": ["max<2000"],
    "http_req_duration{flow:detail}": ["max<2000"],
    "http_req_duration{flow:login}": ["max<2000"],
    "http_req_duration{flow:order}": ["max<2000"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

const KEYWORDS = [
  "ao thun",
  "quan jeans",
  "vay",
  "dam",
  "so mi",
  "kaki",
  "cotton",
  "nu",
  "polo",
  "linen",
];
const SIZES = ["", "", "M", "L"];
const PRODUCT_IDS = Array.from({ length: 40 }, (_, i) => `P${String(i + 1).padStart(3, "0")}`);

const json = (body) => ({
  body: JSON.stringify(body),
  params: { headers: { "content-type": "application/json" } },
});
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const uuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

/** Members for the login flow, and in-stock SKUs for the order flow (read from the API). */
export function setup() {
  const health = http.get(`${BASE_URL}/api/healthz`);
  if (health.status !== 200) throw new Error(`${BASE_URL}/api/healthz answered ${health.status}`);

  const stamp = Date.now();
  const members = [];
  for (let i = 0; i < MEMBERS; i++) {
    const email = `load-${stamp}-${i}@load.abcwear.test`;
    const { body, params } = json({ email, password: PASSWORD, fullName: `Load Test ${i}` });
    const res = http.post(`${BASE_URL}/api/auth/register`, body, params);
    if (res.status !== 201) throw new Error(`register ${email}: HTTP ${res.status} ${res.body}`);
    members.push(email);
  }
  http.cookieJar().clear(BASE_URL); // setup's session must not leak into the VUs

  const skus = [];
  for (const id of PRODUCT_IDS) {
    const res = http.get(`${BASE_URL}/api/products/${id}`);
    if (res.status !== 200) continue;
    for (const v of res.json().variants)
      if (v.purchasable && v.availableQty >= 15) skus.push(v.sku);
  }
  if (skus.length < 20)
    throw new Error(`only ${skus.length} SKUs with stock >= 15; restart the mock`);
  return { members, skus };
}

function search() {
  const size = pick(SIZES);
  const url = `${BASE_URL}/tim-kiem?q=${encodeURIComponent(pick(KEYWORDS))}${size ? `&size=${size}` : ""}`;
  const res = http.get(url, { tags: { flow: "search", name: "GET /tim-kiem" } });
  check(res, { "search 200": (r) => r.status === 200 });
}

function detail() {
  const res = http.get(`${BASE_URL}/san-pham/${pick(PRODUCT_IDS)}`, {
    tags: { flow: "detail", name: "GET /san-pham/[id]" },
  });
  check(res, { "detail 200": (r) => r.status === 200 });
}

function login(members) {
  const { body, params } = json({ email: pick(members), password: PASSWORD });
  const res = http.post(`${BASE_URL}/api/auth/login`, body, {
    ...params,
    tags: { flow: "login", name: "POST /api/auth/login" },
  });
  check(res, { "login 200": (r) => r.status === 200 });
  http.post(`${BASE_URL}/api/auth/logout`, null, {
    tags: { flow: "login", name: "POST /api/auth/logout" },
  });
}

/** Guest checkout: add one item, then place a COD order (IF-03 runs against the mock). */
function order(skus) {
  http.cookieJar().clear(BASE_URL); // a fresh guest cart each time
  const add = json({ sku: pick(skus), quantity: 1 });
  const added = http.post(`${BASE_URL}/api/cart/items`, add.body, {
    ...add.params,
    tags: { flow: "order", name: "POST /api/cart/items" },
  });
  check(added, { "add to cart 200": (r) => r.status === 200 });
  if (added.status !== 200) return;

  const checkout = json({
    customerName: "Khách Kiểm Thử Tải",
    customerEmail: "load-order@load.abcwear.test",
    customerPhone: "0900000000",
    shipLine1: "1 Đường Thử",
    shipWard: "Phường 1",
    shipDistrict: "Quận 1",
    shipProvince: "TP. Hồ Chí Minh",
    shippingMethod: "STANDARD",
  });
  const placed = http.post(`${BASE_URL}/api/orders`, checkout.body, {
    headers: { ...checkout.params.headers, "idempotency-key": uuid() },
    tags: { flow: "order", name: "POST /api/orders" },
  });
  check(placed, { "order 201": (r) => r.status === 201 });
}

export default function shopper(data) {
  const roll = Math.random();
  if (roll < 0.4) group("search", search);
  else if (roll < 0.7) group("detail", detail);
  else if (roll < 0.9) group("login", () => login(data.members));
  else group("order", () => order(data.skus));
  sleep(1 + Math.random() * 2); // think time 1–3 s
}
