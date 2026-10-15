# ABC Wear — Web Site Selling System

Website bán quần áo ABC Wear (Next.js 14 full-stack + MySQL 8.4), kết nối Main System qua module `integration`.
Mọi đơn hàng thanh toán khi nhận hàng (COD). Đặc tả chi tiết: [spec.md](spec.md).

## Yêu cầu

- Node.js ≥ 20.12 (khuyến nghị 22)
- pnpm 9 (`npm i -g pnpm@9` hoặc `corepack enable pnpm`)
- Docker (Docker Desktop trên Windows/macOS)

## Chạy môi trường dev

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:migrate
pnpm dev
```

Khi khởi động, worker kéo danh mục, sản phẩm (IF-01) và tồn kho (IF-02) từ mock Main System vào Selling DB,
sau đó lặp lại mỗi 10 phút (sản phẩm) và mỗi 1 phút (tồn kho). Muốn đồng bộ ngay khi mock đang chạy: `pnpm sync`.
Mỗi lần gọi Main System ghi một dòng vào bảng `sync_log`.

`pnpm dev` chạy song song ba tiến trình:

| Tiến trình | Địa chỉ                       | Mô tả                                                                 |
| ---------- | ----------------------------- | --------------------------------------------------------------------- |
| `web`      | http://localhost:3000         | Next.js (trang + `/api`)                                              |
| `worker`   | —                             | Đồng bộ với Main System, gửi đơn (`worker/index.ts`)                  |
| `mock`     | http://localhost:4100/healthz | Mock Main System (`mock-main/`): IF-01 → IF-04, `/sim/*` để demo/test |

Trang đã có: `/` (trang chủ), `/danh-muc/[slug]` (danh mục, lọc, sắp xếp), `/tim-kiem?q=` (tìm không dấu),
`/san-pham/[id]` (chi tiết, chọn size/màu, thêm giỏ), `/gio-hang`, `/dat-hang` (3 bước, không cần đăng nhập),
`/dat-hang/hoan-tat/[code]`, `/tra-cuu-don` (mã đơn + email), `/dang-ky`, `/dang-nhap`, `/quen-mat-khau`,
`/dat-lai-mat-khau`, `/tai-khoan`, `/tai-khoan/don-hang`, `/tai-khoan/don-hang/[code]` (lịch sử, dòng thời gian trạng thái).
API: `/api/categories`, `/api/products`, `/api/products/[id]`, `/api/auth/*`, `/api/me`, `/api/me/change-password`,
`/api/cart`, `/api/cart/items`, `/api/cart/items/[sku]`, `/api/shipping-methods`, `POST /api/orders` (header `Idempotency-Key`),
`GET /api/orders`, `GET /api/orders/[code]`, `POST /api/orders/lookup`, `POST /api/integration/order-status` (IF-05, header `x-main-secret`).

Email (đặt lại mật khẩu, xác nhận đơn) không gửi ra ngoài mà vào Mailpit: mở http://localhost:8025 để xem.

Đơn mới ở trạng thái `CONFIRMED`; worker gửi sang Main System (IF-04) mỗi 5 giây, lỗi thì thử lại sau
10 s, 20 s, 40 s… (tối đa 10 phút một lần, 10 lần). Phí giao hàng đọc từ
[config/shipping-methods.json](config/shipping-methods.json) lúc build/khởi động.
Giả lập Main System lỗi để xem worker gửi lại (`mode`: `error` trả 503, `timeout` treo 10 s, `none`;
`count` tùy chọn: chỉ làm hỏng N request tiếp theo):

```bash
curl -X POST localhost:4100/sim/fail-mode -H 'content-type: application/json' -d '{"mode":"error","count":2}'
```

Trang demo của mock: http://localhost:4100/sim — danh sách đơn Main đã nhận, nút "Chuyển trạng thái"
(RECEIVED → PICKING → SHIPPING → DELIVERED, hoặc "Giao thất bại" khi đang giao) gọi webhook IF-05 về website
(`WEB_BASE_URL` + `/api/integration/order-status`, kèm `MAIN_WEBHOOK_SECRET`), ô đổi tồn kho và nút giả lập sự cố.
Website gửi email cho khách khi đơn chuyển sang "Đang giao" và "Đã giao". Lệnh tương đương:

```bash
curl -X POST localhost:4100/sim/orders/<mainOrderId>/advance -H 'content-type: application/json' -d '{}'
```

```bash
curl -X POST localhost:4100/sim/stock -H 'content-type: application/json' -d '{"sku":"P001-DEN-M","qty":3}'
```

Dịch vụ trong Docker:

| Dịch vụ   | Địa chỉ                                                |
| --------- | ------------------------------------------------------ |
| MySQL 8.4 | `localhost:3306`, DB `selling`, user `root` / `root`   |
| Mailpit   | SMTP `localhost:1025`, giao diện http://localhost:8025 |

Kiểm tra container đã healthy: `docker compose ps`.

## Lệnh

| Lệnh              | Việc                                                               |
| ----------------- | ------------------------------------------------------------------ |
| `pnpm dev`        | Chạy web + worker + mock                                           |
| `pnpm db:migrate` | Áp migration Prisma vào DB dev (`prisma migrate dev`)              |
| `pnpm db:deploy`  | Áp migration không tương tác (`prisma migrate deploy`)             |
| `pnpm sync`       | Đồng bộ một lần IF-01 + IF-02 từ Main System (mock phải đang chạy) |
| `pnpm mock:seed`  | Sinh lại `mock-main/seed.json` (tất định: 6 danh mục, 40 sản phẩm) |
| `pnpm test`       | Unit + integration test (Vitest); integration cần MySQL đang chạy  |
| `pnpm test:e2e`   | E2E (Playwright, Chrome); tự chạy `pnpm dev` nếu chưa chạy         |
| `pnpm lint`       | ESLint                                                             |
| `pnpm typecheck`  | TypeScript `tsc --noEmit`                                          |
| `pnpm format`     | Prettier                                                           |

E2E (`tests/e2e/`) cần Docker đang chạy và Google Chrome trên máy (không cần tải trình duyệt).
Dùng Chromium của Playwright: `pnpm exec playwright install chromium` rồi đặt `PW_CHANNEL=chromium`;
dùng Edge: `PW_CHANNEL=msedge`. Báo cáo HTML: `pnpm exec playwright show-report`.

Test integration (`tests/integration/`) chạy trên DB riêng `selling_test`, tự tạo và migrate khi chạy test;
đổi bằng biến `TEST_DATABASE_URL`. Chỉ chạy unit: `pnpm vitest run --project unit`.

## Cấu hình

Biến môi trường mô tả trong [.env.example](.env.example). `src/lib/config.ts` kiểm tra bằng zod;
thiếu hoặc sai biến thì tiến trình dừng và liệt kê từng biến lỗi.

## Cấu trúc

```
app/            trang và route handlers (/api/...)
components/     UI dùng chung
src/modules/    catalog | member | order | integration
src/lib/        thư viện dùng chung (config, db, auth, ...)
worker/         tiến trình nền
mock-main/      mock Main System (Fastify, port 4100)
prisma/         schema và seed
tests/          unit | integration | e2e | load
```

Tiến độ: [PROGRESS.md](PROGRESS.md). Quyết định kỹ thuật: [DECISIONS.md](DECISIONS.md).
