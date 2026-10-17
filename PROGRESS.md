# PROGRESS

Điều kiện chung mỗi milestone: `pnpm lint && pnpm typecheck && pnpm test` xanh, `pnpm dev` chạy được, commit `M<n>: …`.

## M0 — Khung dự án và hạ tầng dev ✅

- [x] 1. Khởi tạo Next.js 14 (App Router) + TypeScript strict + Tailwind + ESLint/Prettier; pnpm
- [x] 2. `docker-compose.yml`: `mysql:8.4` + `axllent/mailpit`, healthcheck cả hai; MinIO (`minio` + `minio-init`, bucket `product-images` đọc công khai) thêm ở M6
- [x] 3. `.env.example`; `src/lib/config.ts` đọc env bằng zod
- [x] 4. Khung `worker/index.ts` và `mock-main/server.ts` (Fastify, port 4100, `/healthz`)
- [x] 5. `pnpm dev` chạy song song Next.js, worker, mock (`concurrently`)
- [x] 6. `README.md`, `DECISIONS.md`, `PROGRESS.md`

## M1 — CSDL, thư viện dùng chung, mock Main System, đồng bộ sản phẩm (IF-01, IF-02) ✅

- [x] 1. `prisma/schema.prisma`, migration `init`, `src/lib/db.ts`
- [x] 2. `src/lib/errors.ts`: mã lỗi, `AppError`, `toErrorResponse()`
- [x] 3. `money.ts`, `order-code.ts`, `order-state.ts` + unit test
- [x] 4. `mock-main/generate-seed.ts` → `seed.json`; `GET /main/catalog`, `GET /main/stock`; `store.ts` lưu bền `data/store.json`, `POST /sim/reset` (bổ sung ở M6)
- [x] 5. `mock-main/minio.ts`, `mock-main/seed-images.ts`, `pnpm seed:images`; URL ảnh seed trong dữ liệu sản phẩm (bổ sung ở M6)
- [x] 6. `src/modules/integration`: `MainSystemClient`, `HttpMainSystemClient`, ghi `sync_log`
- [x] 7. `syncCatalog()` (gồm mảng URL ảnh), `syncStock()`; worker theo chu kỳ; `pnpm sync`
- [x] 8. Test integration `syncCatalog()` với mock thật

## M2 — Tìm kiếm và duyệt sản phẩm (PS-01 → PS-04) ✅

- [x] 1. `src/modules/catalog`: `getCategoryTree()`, `listProducts()`, `getProduct()`
- [x] 2. Route `/api/categories`, `/api/products`, `/api/products/[id]`
- [x] 3. Layout chung: header, menu danh mục, responsive
- [x] 4. Trang `/`, `/danh-muc/[slug]`, `/tim-kiem`, `/san-pham/[id]` (SSR, bộ lọc theo query string)
- [x] 5. Component `ProductCard`, `FilterPanel`, `SortSelect`, `Pagination`, `PriceTag`, `VariantPicker`, `StockBadge`; `ProductGallery` + `next/image` theo `MINIO_PUBLIC_URL` (bổ sung ở M6)
- [x] 6. Playwright (Chromium); E2E PS-01 → PS-04

## M3 — Thành viên (MA-01 → MA-04) ✅

- [x] 1. `src/lib/auth.ts`: JWT (`jose`), cookie, `getCurrentMember()`
- [x] 2. `src/modules/member`: `register()`, `login()` (QT9), `updateProfile()`, `changePassword()`
- [x] 3. `src/lib/email.ts` + email đặt lại mật khẩu; `requestPasswordReset()`, `resetPassword()`
- [x] 4. Route `/api/auth/*`, `/api/me`, `/api/me/change-password`
- [x] 5. Trang `/dang-ky`, `/dang-nhap`, `/quen-mat-khau`, `/dat-lai-mat-khau`, `/tai-khoan`; `middleware.ts`; header thành viên
- [x] 6. Helper đọc email Mailpit; E2E MA-01 → MA-04; test khóa tài khoản

## M4 — Giỏ hàng và đặt hàng COD (OD-01 → OD-04, IF-03, IF-04) ✅

- [x] 1. Cookie `sid`; `src/modules/order/cart.ts` (QT1, QT7); `mergeGuestCart()` (QT10)
- [x] 2. Route `/api/cart`, `/api/cart/items`, `/api/cart/items/[sku]`; badge giỏ
- [x] 3. `config/shipping-methods.json`; `/api/shipping-methods`
- [x] 4. Mock `POST /main/stock-check`, `POST /main/orders`, `POST /sim/fail-mode`; `checkStock()`, `sendOrder()`
- [x] 5. `src/modules/order/place-order.ts`; `POST /api/orders`
- [x] 6. Email xác nhận đơn (OD-04)
- [x] 7. Worker IF-04 `sendPendingOrders()` (thử lại lũy thừa, tối đa 10 lần)
- [x] 8. Trang `/gio-hang`, `/dat-hang` (3 bước), `/dat-hang/hoan-tat/[code]`
- [x] 9. Test integration `placeOrder()`, worker gửi lại; E2E OD-01 → OD-04

## M5 — Theo dõi đơn (OD-05, OD-06, IF-05) ✅

- [x] 1. Mock `POST /sim/orders/:mainOrderId/advance`, trang `/sim`, `POST /sim/stock`
- [x] 2. Route `POST /api/integration/order-status`; email khi `SHIPPING`, `DELIVERED`
- [x] 3. `src/modules/order/queries.ts`: `listMemberOrders()`, `getMemberOrder()`, `lookupGuestOrder()`
- [x] 4. Route `/api/orders`, `/api/orders/[code]`, `/api/orders/lookup`
- [x] 5. Trang `/tai-khoan/don-hang`, `/tai-khoan/don-hang/[code]`, `/tra-cuu-don`
- [x] 6. E2E OD-05, OD-06, IN-01, IN-02

## M6 — Quản lý sản phẩm và ảnh ở mock Main System (AD-01 → AD-05, MinIO) ✅

- [x] 1. `@fastify/basic-auth` cho `/admin` và `/admin/api/*`; `@fastify/static` phục vụ `mock-main/admin/`
- [x] 2. API sản phẩm, biến thể (`GET/POST/PUT /admin/api/products…`, `PATCH /admin/api/variants/:sku`, `GET /admin/api/categories`), zod, SKU trùng → 409
- [x] 3. `images.ts` (sharp) + API ảnh: upload nhiều file, xóa, đổi thứ tự; multipart 5 MB/file
- [x] 4. `notify.ts` gọi webhook sau mỗi thao tác ghi; `POST /admin/api/sync`, `GET /admin/api/sync/last`
- [x] 5. Web: `POST /api/integration/catalog-changed` (secret, không chạy song song, `revalidatePath`, `sync_log`)
- [x] 6. `admin/index.html` (danh sách, đồng bộ ngay) và `admin/product.html` (form, biến thể, khu ảnh)
- [x] 7. `tests/fixtures/`: JPG, PNG, PDF đổi đuôi `.jpg`; ảnh > 5 MB sinh trong test
- [x] 8. Test integration mock + MinIO thật (`tests/integration/admin-images.test.ts`)
- [x] 9. E2E AD-01 → AD-05 (`tests/e2e/admin.spec.ts`)

## M7 — Phi chức năng và bàn giao (bàn giao; k6 chưa đạt `max<2000` trên laptop — xem tests/load/result.md)

- [x] 1. `EXPLAIN` truy vấn `listProducts`, thêm chỉ mục nếu cần
- [x] 2. `/api/healthz`; rà tiến trình web không giữ trạng thái
- [x] 3. `tests/load/k6.js` (100 VU, 2 phút); `tests/load/result.md` — 0% lỗi, p99 1,90 s, **max 3,75 s > 2 s** (máy đo bão hòa CPU)
- [x] 4. Rà giao diện: lỗi tiếng Việt, trạng thái tải/rỗng/lỗi, 375px
- [x] 5. README hoàn chỉnh (multi-instance, tài khoản `/admin` và console MinIO, kịch bản demo bắt đầu từ `/admin`, bảng truy vết)
- [x] 6. Chạy lại toàn bộ test; cập nhật `DECISIONS.md`, `PROGRESS.md`
