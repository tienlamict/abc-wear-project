# PROGRESS

Điều kiện chung mỗi milestone: `pnpm lint && pnpm typecheck && pnpm test` xanh, `pnpm dev` chạy được, commit `M<n>: …`.

## M0 — Khung dự án và hạ tầng dev ✅

- [x] 1. Khởi tạo Next.js 14 (App Router) + TypeScript strict + Tailwind + ESLint/Prettier; pnpm
- [x] 2. `docker-compose.yml`: `mysql:8.4` + `axllent/mailpit`, healthcheck cả hai
- [x] 3. `.env.example`; `src/lib/config.ts` đọc env bằng zod
- [x] 4. Khung `worker/index.ts` và `mock-main/server.ts` (Fastify, port 4100, `/healthz`)
- [x] 5. `pnpm dev` chạy song song Next.js, worker, mock (`concurrently`)
- [x] 6. `README.md`, `DECISIONS.md`, `PROGRESS.md`

## M1 — CSDL, thư viện dùng chung, mock Main System, đồng bộ sản phẩm (IF-01, IF-02)

- [ ] 1. `prisma/schema.prisma`, migration `init`, `src/lib/db.ts`
- [ ] 2. `src/lib/errors.ts`: mã lỗi, `AppError`, `toErrorResponse()`
- [ ] 3. `money.ts`, `order-code.ts`, `order-state.ts` + unit test
- [ ] 4. `mock-main/generate-seed.ts` → `seed.json`; `GET /main/catalog`, `GET /main/stock`
- [ ] 5. `src/modules/integration`: `MainSystemClient`, `HttpMainSystemClient`, ghi `sync_log`
- [ ] 6. `syncCatalog()`, `syncStock()`; worker theo chu kỳ; `pnpm sync`
- [ ] 7. Test integration `syncCatalog()` với mock thật

## M2 — Tìm kiếm và duyệt sản phẩm (PS-01 → PS-04)

- [ ] 1. `src/modules/catalog`: `getCategoryTree()`, `listProducts()`, `getProduct()`
- [ ] 2. Route `/api/categories`, `/api/products`, `/api/products/[id]`
- [ ] 3. Layout chung: header, menu danh mục, responsive
- [ ] 4. Trang `/`, `/danh-muc/[slug]`, `/tim-kiem`, `/san-pham/[id]` (SSR, bộ lọc theo query string)
- [ ] 5. Component `ProductCard`, `FilterPanel`, `SortSelect`, `Pagination`, `PriceTag`, `VariantPicker`, `StockBadge`
- [ ] 6. Playwright (Chromium); E2E PS-01 → PS-04

## M3 — Thành viên (MA-01 → MA-04)

- [ ] 1. `src/lib/auth.ts`: JWT (`jose`), cookie, `getCurrentMember()`
- [ ] 2. `src/modules/member`: `register()`, `login()` (QT9), `updateProfile()`, `changePassword()`
- [ ] 3. `src/lib/email.ts` + email đặt lại mật khẩu; `requestPasswordReset()`, `resetPassword()`
- [ ] 4. Route `/api/auth/*`, `/api/me`, `/api/me/change-password`
- [ ] 5. Trang `/dang-ky`, `/dang-nhap`, `/quen-mat-khau`, `/dat-lai-mat-khau`, `/tai-khoan`; `middleware.ts`; header thành viên
- [ ] 6. Helper đọc email Mailpit; E2E MA-01 → MA-04; test khóa tài khoản

## M4 — Giỏ hàng và đặt hàng COD (OD-01 → OD-04, IF-03, IF-04)

- [ ] 1. Cookie `sid`; `src/modules/order/cart.ts` (QT1, QT7); `mergeGuestCart()` (QT10)
- [ ] 2. Route `/api/cart`, `/api/cart/items`, `/api/cart/items/[sku]`; badge giỏ
- [ ] 3. `config/shipping-methods.json`; `/api/shipping-methods`
- [ ] 4. Mock `POST /main/stock-check`, `POST /main/orders`, `POST /sim/fail-mode`; `checkStock()`, `sendOrder()`
- [ ] 5. `src/modules/order/place-order.ts`; `POST /api/orders`
- [ ] 6. Email xác nhận đơn (OD-04)
- [ ] 7. Worker IF-04 `sendPendingOrders()` (thử lại lũy thừa, tối đa 10 lần)
- [ ] 8. Trang `/gio-hang`, `/dat-hang` (3 bước), `/dat-hang/hoan-tat/[code]`
- [ ] 9. Test integration `placeOrder()`, worker gửi lại; E2E OD-01 → OD-04

## M5 — Theo dõi đơn (OD-05, OD-06, IF-05)

- [ ] 1. Mock `POST /sim/orders/:mainOrderId/advance`, trang `/sim`, `POST /sim/stock`
- [ ] 2. Route `POST /api/integration/order-status`; email khi `SHIPPING`, `DELIVERED`
- [ ] 3. `src/modules/order/queries.ts`: `listMemberOrders()`, `getMemberOrder()`, `lookupGuestOrder()`
- [ ] 4. Route `/api/orders`, `/api/orders/[code]`, `/api/orders/lookup`
- [ ] 5. Trang `/tai-khoan/don-hang`, `/tai-khoan/don-hang/[code]`, `/tra-cuu-don`
- [ ] 6. E2E OD-05, OD-06, IN-01, IN-02

## M6 — Phi chức năng và bàn giao

- [ ] 1. `EXPLAIN` truy vấn `listProducts`, thêm chỉ mục nếu cần
- [ ] 2. `/api/healthz`; rà tiến trình web không giữ trạng thái
- [ ] 3. `tests/load/k6.js` (100 VU, 2 phút); `tests/load/result.md`
- [ ] 4. Rà giao diện: lỗi tiếng Việt, trạng thái tải/rỗng/lỗi, 375px
- [ ] 5. README hoàn chỉnh (multi-instance, kịch bản demo, bảng truy vết)
- [ ] 6. Chạy lại toàn bộ test; cập nhật `DECISIONS.md`, `PROGRESS.md`
