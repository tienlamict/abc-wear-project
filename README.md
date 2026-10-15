# ABC Wear — Web Site Selling System

Website bán quần áo ABC Wear: Next.js 14 full-stack + MySQL 8.4, kết nối Main System qua module `integration`
(ở đây là mock Main System). Mọi đơn hàng thanh toán khi nhận hàng (COD); khách không cần tài khoản để đặt hàng.
Đặc tả: [spec.md](spec.md) · Tiến độ: [PROGRESS.md](PROGRESS.md) · Quyết định kỹ thuật: [DECISIONS.md](DECISIONS.md).

## Yêu cầu

- Node.js ≥ 20.12 (khuyến nghị 22)
- pnpm 9 (`corepack enable pnpm` hoặc `npm i -g pnpm@9`)
- Docker (Docker Desktop trên Windows/macOS)
- Google Chrome — chỉ để chạy E2E (Playwright dùng Chrome có sẵn, không tải trình duyệt)

## Cài đặt và chạy (khoảng 5 phút)

```bash
cp .env.example .env
```

```bash
docker compose up -d --wait
```

```bash
pnpm install
```

```bash
pnpm db:deploy
```

```bash
pnpm dev
```

- `docker compose` dựng MySQL 8.4 (DB `selling`) và Mailpit; `--wait` chờ cả hai healthy.
- `pnpm db:deploy` áp toàn bộ migration Prisma (dùng `pnpm db:migrate` khi đang sửa schema).
- `pnpm dev` chạy ba tiến trình: web http://localhost:3000, worker, mock Main System http://localhost:4100.
  Vài giây sau khi mock lên, worker kéo 6 danh mục, 40 sản phẩm, 195 biến thể và tồn kho vào Selling DB.
  Muốn nạp dữ liệu mà không chạy mock: `pnpm db:seed`.
- Email (xác nhận đơn, đặt lại mật khẩu, đổi trạng thái) không ra ngoài mà vào Mailpit: http://localhost:8025.

| Tiến trình / dịch vụ | Địa chỉ                                      | Vai trò                                                     |
| -------------------- | -------------------------------------------- | ----------------------------------------------------------- |
| `web`                | http://localhost:3000                        | Next.js: trang + `/api`                                     |
| `worker`             | —                                            | IF-01 mỗi 10 phút, IF-02 mỗi phút, gửi đơn IF-04 mỗi 5 giây |
| `mock`               | http://localhost:4100/sim                    | Mock Main System + trang demo                               |
| MySQL 8.4            | `localhost:3306`, `root` / `root`            | Selling DB (`selling`), test DB (`selling_test`)            |
| Mailpit              | SMTP `localhost:1025`, http://localhost:8025 | Hộp thư thử                                                 |

## Kịch bản demo

Mở song song http://localhost:3000 (website), http://localhost:4100/sim (Main System) và http://localhost:8025 (hộp thư).

1. **Tìm kiếm (PS-01, PS-02).** Gõ `ao thun` (không dấu) vào ô tìm kiếm → ra các sản phẩm "Áo thun …". Chọn size M,
   giá từ 200000 đến 350000, bấm "Áp dụng", rồi "Sắp xếp: Giá tăng dần". Bộ lọc nằm trên URL, chia sẻ được.
2. **Danh mục (PS-03).** Bấm "Nam" trên menu → thấy sản phẩm của cả "Áo thun nam" và "Quần nam".
3. **Chi tiết (PS-04).** Mở "Áo thun nam cổ tròn basic", chọn màu Hồng pastel, size L → "Tạm hết hàng", nút
   "Thêm vào giỏ" bị khóa. Chọn size XL → thêm 2 sản phẩm vào giỏ; số trên "Giỏ hàng" tăng.
4. **Đặt hàng vãng lai (OD-01 → OD-04).** Vào "Giỏ hàng" → "Tiến hành đặt hàng": (1) nhập người nhận, địa chỉ,
   email; (2) chọn "Nhanh" — tổng COD = tiền hàng + 50.000 ₫; (3) "Đặt hàng". Trang hoàn tất hiện mã đơn
   `ABC-YYMMDD-XXXXX` và số tiền COD. Email xác nhận xuất hiện trong Mailpit.
5. **Đơn sang Main (IF-04).** Trong ≤ 10 giây đơn hiện ở http://localhost:4100/sim, trạng thái `RECEIVED`.
6. **Main chuyển trạng thái (IF-05).** Bấm "Chuyển trạng thái" hai lần (→ PICKING → SHIPPING). Main gọi webhook về
   website; khách nhận email "đang được giao" kèm mã vận đơn.
7. **Tra cứu (OD-05).** Bấm "Tra cứu đơn" trên website (hoặc link trong email — mã đơn được điền sẵn), nhập mã đơn +
   email → thấy "Đang giao hàng", dòng thời gian, mã vận đơn. Nhập sai email → "Không tìm thấy đơn".
8. **Đăng ký (MA-01, MA-04).** "Đăng nhập" → "Tạo tài khoản mới" → dùng được ngay. Ở "Tài khoản", nhập số điện thoại
   và địa chỉ mặc định → "Lưu thông tin".
9. **Lịch sử (OD-06).** Thêm một sản phẩm vào giỏ, đặt hàng — thông tin giao hàng đã được điền sẵn từ hồ sơ. Vào
   "Tài khoản" → "Đơn hàng của tôi": đơn mới nhất đứng đầu, bấm vào để xem chi tiết.

Thêm nếu còn thời gian:

- **Main lỗi tạm thời (IN-02):** ở /sim bấm "Lỗi 2 lần gửi đơn", đặt một đơn mới. Worker gửi lại sau 10 s rồi 20 s;
  đơn vẫn sang Main đúng một lần (cột "Số lần nhận" = 1). Đặt hàng khi Main "Treo (timeout)" → website báo hệ thống
  bận, không tạo đơn. Bấm "Bình thường" để trả lại.
- **Tồn kho (IN-01):** ở /sim đổi tồn kho một SKU (ví dụ `P001-DEN-M` = 3) → sau ≤ 1 phút trang sản phẩm hiện
  "Chỉ còn 3 sản phẩm".
- **Khóa tài khoản (MA-02):** đăng nhập sai mật khẩu 5 lần → khóa 15 phút; "Quên mật khẩu?" gửi link đặt lại vào
  Mailpit, đặt lại xong tài khoản được mở khóa.

Lệnh tương đương cho mock (khi không dùng trang /sim):

```bash
curl -X POST localhost:4100/sim/orders/<mainOrderId>/advance -H 'content-type: application/json' -d '{}'
```

```bash
curl -X POST localhost:4100/sim/stock -H 'content-type: application/json' -d '{"sku":"P001-DEN-M","qty":3}'
```

```bash
curl -X POST localhost:4100/sim/fail-mode -H 'content-type: application/json' -d '{"mode":"error","count":2,"only":"/main/orders"}'
```

`advance` nhận `{ "to": "DELIVERY_FAILED" }` khi đơn đang `SHIPPING`, hoặc `to` = trạng thái hiện tại để gửi lại
webhook. `fail-mode`: `error` (503), `timeout` (treo 10 s), `none`; `count` và `only` là tùy chọn.

## Lệnh

| Lệnh                 | Việc                                                                              |
| -------------------- | --------------------------------------------------------------------------------- |
| `pnpm dev`           | Web + worker + mock ở chế độ dev                                                  |
| `pnpm build`         | Build production Next.js                                                          |
| `pnpm start:all`     | Production: web (cluster nhiều tiến trình) + worker + mock — dùng cho demo và k6  |
| `pnpm start:cluster` | Chỉ web production, mỗi nhân một tiến trình (`WEB_WORKERS`, mặc định ≤ 4)         |
| `pnpm start`         | Chỉ web production, một tiến trình (`next start`)                                 |
| `pnpm db:deploy`     | Áp migration (`prisma migrate deploy`)                                            |
| `pnpm db:migrate`    | Tạo/áp migration khi sửa schema (`prisma migrate dev`)                            |
| `pnpm db:seed`       | Nạp danh mục, sản phẩm, tồn kho từ mock chạy tạm trong tiến trình                 |
| `pnpm sync`          | Đồng bộ ngay IF-01 + IF-02 từ Main System đang chạy                               |
| `pnpm mock:seed`     | Sinh lại `mock-main/seed.json` (tất định)                                         |
| `pnpm test`          | Unit + integration (Vitest); cần MySQL                                            |
| `pnpm test:e2e`      | E2E (Playwright, Chrome); dùng lại server ở :3000 nếu có, không thì tự `pnpm dev` |
| `pnpm test:load`     | k6 (Docker image `grafana/k6`) vào http://localhost:3000                          |
| `pnpm lint`          | ESLint · `pnpm typecheck`: `tsc --noEmit` · `pnpm format`: Prettier               |

## Kiểm thử

| Loại        | Ở đâu                | Số lượng | Ghi chú                                                                                      |
| ----------- | -------------------- | -------- | -------------------------------------------------------------------------------------------- |
| Unit        | `tests/unit/`        | 92       | Hàm thuần, mock Main (inject), client tích hợp, bcrypt worker                                |
| Integration | `tests/integration/` | 54       | Module thật + MySQL `selling_test` (tự migrate) + mock Main thật                             |
| E2E         | `tests/e2e/`         | 27       | Mọi use case + khổ 375 px; đọc email thật qua API Mailpit                                    |
| Tải         | `tests/load/`        | —        | [k6.js](tests/load/k6.js), [kết quả](tests/load/result.md), [EXPLAIN](tests/load/explain.md) |

- Integration dùng DB riêng `selling_test` (đổi bằng `TEST_DATABASE_URL`); chỉ chạy unit: `pnpm vitest run --project unit`.
- E2E chạy trên môi trường dev (DB `selling`, mock 4100): bước setup gọi `pnpm sync`; tài khoản/đơn E2E để lại trong DB
  dev. Chrome mặc định; `PW_CHANNEL=msedge` dùng Edge, `PW_CHANNEL=chromium` dùng Chromium của Playwright (sau
  `pnpm exec playwright install chromium`). Báo cáo: `pnpm exec playwright show-report`.
- Kiểm thử tải chạy trên bản production: `pnpm build`, `pnpm start:all`, rồi `pnpm test:load`.

## Chạy nhiều instance (NF-02)

Tiến trình web **không giữ trạng thái trong bộ nhớ**, nên chạy bao nhiêu instance sau load balancer cũng được,
không cần sticky session:

- Phiên đăng nhập là JWT trong cookie httpOnly — instance nào cũng kiểm được, miễn là cùng `JWT_SECRET`.
- Giỏ hàng (vãng lai theo cookie `sid`), khóa đăng nhập, đơn hàng, hàng đợi gửi Main đều nằm trong MySQL.
- Biến cấp module chỉ là cache bất biến: cấu hình, Prisma client, kết nối SMTP, pool luồng bcrypt.

Cách triển khai gợi ý (mô tả, không dựng trong repo):

```
             ┌──────────────┐   /api/healthz   ┌─────────────┐
 Internet ──►│ Load balancer├──► web #1 ───────┤             │
             │ (nginx / ALB)├──► web #2 ───────┤  MySQL 8.4  │◄── worker (1 instance)
             └──────────────┘   web #N ────────┤ (Selling DB)│        │
                                               └─────────────┘        ▼
                                                                 Main System
```

1. Mỗi instance web: `pnpm build` một lần, chạy `pnpm start:cluster` (hoặc `pnpm start`) với cùng `.env`
   (`DATABASE_URL`, `JWT_SECRET`, `MAIN_WEBHOOK_SECRET`, `WEB_BASE_URL` là địa chỉ công khai của load balancer, …).
2. Load balancer chia request vòng tròn, health check `GET /api/healthz` (200 khi DB trả lời, 503 khi không) để
   tự loại instance hỏng; Main System gọi webhook IF-05 vào địa chỉ của load balancer.
3. **Một** tiến trình worker (`tsx worker/index.ts`). Chạy hai worker vẫn không tạo đơn trùng ở Main (IF-04 idempotent
   theo id đơn, cập nhật trạng thái có điều kiện) nhưng sẽ gửi thừa request.
4. Trên một máy, `pnpm start:cluster` đã chạy mỗi nhân một tiến trình web chung cổng 3000 (`node:cluster`) — chính là
   mô hình nhiều instance thu nhỏ, và là cách đạt kết quả trong [tests/load/result.md](tests/load/result.md).

## Truy vết use case

| Use case | Trang                                               | API                                                                                            | Test                                                                                    |
| -------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| PS-01    | `/tim-kiem?q=`                                      | `GET /api/products?q=`                                                                         | e2e/catalog.spec.ts, integration/catalog.test.ts                                        |
| PS-02    | `/danh-muc/[slug]`, `/tim-kiem` (bộ lọc, sắp xếp)   | `GET /api/products?size&color&minPrice&maxPrice&sort&page`                                     | e2e/catalog.spec.ts, integration/catalog.test.ts, unit/catalog-filters.test.ts          |
| PS-03    | `/`, `/danh-muc/[slug]`, menu header                | `GET /api/categories`, `GET /api/products?category=`                                           | e2e/catalog.spec.ts, integration/catalog.test.ts                                        |
| PS-04    | `/san-pham/[id]`                                    | `GET /api/products/[id]`                                                                       | e2e/catalog.spec.ts, integration/catalog.test.ts                                        |
| MA-01    | `/dang-ky`                                          | `POST /api/auth/register`                                                                      | e2e/member.spec.ts, integration/member.test.ts                                          |
| MA-02    | `/dang-nhap`, nút Đăng xuất                         | `POST /api/auth/login`, `/api/auth/logout`                                                     | e2e/member.spec.ts, e2e/order.spec.ts (QT10), integration/member.test.ts, order.test.ts |
| MA-03    | `/quen-mat-khau`, `/dat-lai-mat-khau`, `/tai-khoan` | `POST /api/auth/forgot-password`, `/reset-password`, `/api/me/change-password`                 | e2e/member.spec.ts, integration/member.test.ts, unit/password.test.ts                   |
| MA-04    | `/tai-khoan`                                        | `GET`, `PATCH /api/me`                                                                         | e2e/member.spec.ts, e2e/order.spec.ts (điền sẵn), integration/member.test.ts            |
| OD-01    | `/san-pham/[id]`, `/gio-hang`                       | `GET /api/cart`, `POST /api/cart/items`, `PATCH`/`DELETE /api/cart/items/[sku]`                | e2e/order.spec.ts, integration/order.test.ts                                            |
| OD-02    | `/dat-hang` (bước 1, 3)                             | `POST /api/orders`                                                                             | e2e/order.spec.ts, integration/order.test.ts                                            |
| OD-03    | `/dat-hang` (bước 2)                                | `GET /api/shipping-methods`, `POST /api/orders`                                                | e2e/order.spec.ts, integration/order.test.ts                                            |
| OD-04    | `/dat-hang/hoan-tat/[code]`, email                  | `POST /api/orders`                                                                             | e2e/order.spec.ts, integration/order.test.ts                                            |
| OD-05    | `/tra-cuu-don`, `/tai-khoan/don-hang/[code]`        | `POST /api/orders/lookup`, `GET /api/orders/[code]`                                            | e2e/tracking.spec.ts, integration/tracking.test.ts                                      |
| OD-06    | `/tai-khoan/don-hang`                               | `GET /api/orders`                                                                              | e2e/tracking.spec.ts, integration/tracking.test.ts                                      |
| IN-01    | (worker IF-01, IF-02)                               | Main: `GET /main/catalog`, `GET /main/stock`                                                   | e2e/tracking.spec.ts, integration/sync.test.ts                                          |
| IN-02    | (worker IF-04; webhook IF-05; IF-03 khi đặt hàng)   | Main: `POST /main/stock-check`, `POST /main/orders`; web: `POST /api/integration/order-status` | e2e/tracking.spec.ts, integration/order.test.ts, tracking.test.ts                       |
| NF-01    | —                                                   | —                                                                                              | load/k6.js, load/result.md, load/explain.md                                             |
| NF-02    | —                                                   | `GET /api/healthz`                                                                             | integration/health.test.ts, unit/health.test.ts                                         |
| NF-04    | mọi trang, khổ 375 px                               | lỗi `{ error: { code, message } }` tiếng Việt                                                  | e2e/responsive.spec.ts, unit/errors.test.ts                                             |

(Đường dẫn test tính từ `tests/`.)

## Cấu hình

Biến bắt buộc nằm trong [.env.example](.env.example); `src/lib/config.ts` kiểm tra bằng zod, thiếu hoặc sai biến thì
tiến trình dừng và liệt kê từng biến lỗi.

| Biến                    | Dùng cho                                                      |
| ----------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`          | Selling DB                                                    |
| `JWT_SECRET`            | Ký phiên đăng nhập và link đặt lại mật khẩu                   |
| `MAIN_SYSTEM_URL`       | Địa chỉ Main System (mock: http://localhost:4100)             |
| `MAIN_WEBHOOK_SECRET`   | Header `x-main-secret` của webhook IF-05 (mock đọc cùng biến) |
| `WEB_BASE_URL`          | Link trong email; mock gửi webhook về `WEB_BASE_URL/api/...`  |
| `SMTP_URL`, `MAIL_FROM` | Gửi email (Mailpit ở dev)                                     |
| `MAIN_TIMEOUT_MS`       | Timeout mỗi lần gọi Main (mặc định 3000)                      |

Tùy chọn: `WEB_WORKERS`, `PORT` (`start:cluster`); `BCRYPT_THREADS` (luồng bcrypt mỗi tiến trình, mặc định 2);
`MOCK_MAIN_PORT`, `MOCK_WEBHOOK_URL` (mock); `TEST_DATABASE_URL` (integration); `E2E_BASE_URL`, `PW_CHANNEL`,
`MAILPIT_URL` (E2E); `BASE_URL`, `MEMBERS` (k6).

## Cấu trúc

```
app/            trang và route handlers (/api/...)
components/     UI dùng chung
src/modules/    catalog | member | order | integration (chỉ integration gọi Main System)
src/lib/        dùng chung: config, db, auth, email, errors, money, order-state, validation, password…
worker/         tiến trình nền (đồng bộ, gửi đơn) và `pnpm sync`
mock-main/      mock Main System (Fastify, port 4100) + trang /sim
scripts/        web-cluster.mjs (web production nhiều tiến trình)
prisma/         schema, migration, seed
config/         shipping-methods.json (phí giao hàng)
tests/          unit | integration | e2e | load
```
