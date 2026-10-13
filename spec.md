# spec.md — Web Site Selling System (ABC Wear) · Bản rút gọn 1 tuần

> Đặc tả triển khai cho Claude Code, thời hạn **1 tuần**, chia 7 milestone và 3 sprint.
> Nguồn: tài liệu "Phân tích và thiết kế hệ thống – Web Site Selling System (ABC Wear)". Mã use case, giao diện IF, NFR giữ nguyên để truy vết.
> **Không có thanh toán trực tuyến** — mọi đơn là COD. **CSDL: MySQL 8.**
> Bản này giữ đủ yêu cầu bắt buộc của RFP; phần lược bỏ ghi ở mục 15.

---

## 0. Cách làm việc (dành cho Claude Code)

1. Làm theo **milestone ở mục 12**, theo thứ tự sprint ở mục 13. Trong một milestone, làm các bước theo đúng thứ tự đánh số. Cuối mỗi milestone: ứng dụng chạy được, test xanh, commit với message `M<n>: …`.
2. **Ưu tiên đơn giản.** Không thêm thư viện hay hạ tầng ngoài mục 4. Không làm gì trong mục 15.
3. Gặp điểm chưa rõ: chọn cách đơn giản nhất phù hợp spec, ghi một dòng vào `DECISIONS.md`, làm tiếp, không dừng lại hỏi.
4. Chỉ module `integration` được gọi Main System.
5. Giao diện tiếng Việt; code, tên biến, commit bằng tiếng Anh.
6. Đánh dấu tiến độ trong `PROGRESS.md` theo checklist mục 12.

---

## 1. Đáp ứng đề bài (RFP)

| Yêu cầu RFP | Cách đáp ứng trong bản này |
|---|---|
| Product Search | PS-01 → PS-04 đầy đủ |
| Member Administration | MA-01 → MA-04 (đăng ký, đăng nhập, mật khẩu, hồ sơ) |
| Order | OD-01 → OD-06 (giỏ, đặt hàng COD, email xác nhận, tra cứu, lịch sử) |
| Selling DB | MySQL, 9 bảng (mục 6) |
| Kết nối Main System, Transportation | Mock Main System + module integration: IF-01 → IF-05 |
| Dễ sử dụng | Đặt hàng 3 bước, không bắt đăng nhập, responsive |
| 24 giờ/365 ngày | Ứng dụng stateless (phiên bằng JWT cookie, không giữ trạng thái trong bộ nhớ), đơn gửi Main qua hàng đợi có thử lại, `/api/healthz`; README mô tả cách chạy nhiều instance sau load balancer |
| Phản hồi < 2 giây | Chỉ mục MySQL, render phía server; script k6 đo và chứng minh |
| Chức năng quản trị nội bộ ngoài phạm vi | Không làm trang quản trị; dữ liệu sản phẩm đến từ Main System |

---

## 2. Phạm vi

### 2.1 Làm

| Mã | Use case | Ghi chú rút gọn |
|---|---|---|
| PS-01 | Tìm theo từ khóa | MySQL `LIKE` trên tên + mô tả; collation không phân biệt dấu nên "ao thun" khớp "áo thun" |
| PS-02 | Lọc size, màu, khoảng giá; sắp xếp giá, mới nhất | |
| PS-03 | Duyệt theo danh mục (2 cấp) | |
| PS-04 | Chi tiết sản phẩm, tồn kho theo size/màu | |
| MA-01 | Đăng ký | **Không xác thực email**; tài khoản dùng được ngay |
| MA-02 | Đăng nhập, đăng xuất | Khóa 15 phút sau 5 lần sai |
| MA-03 | Đổi mật khẩu; quên mật khẩu qua email | Email đi vào Mailpit |
| MA-04 | Xem, sửa hồ sơ (họ tên, SĐT, **một** địa chỉ giao mặc định) | Thay cho sổ địa chỉ |
| OD-01 | Giỏ hàng (vãng lai dùng cookie `sid`) | Đăng nhập thì gộp giỏ |
| OD-02 | Đặt hàng: địa chỉ giao, xác nhận | Không bắt đăng nhập |
| OD-03 | Chọn phương thức giao, xem tổng COD | Phí giao từ file cấu hình |
| OD-04 | Email xác nhận đơn | Mailpit |
| OD-05 | Tra cứu trạng thái (thành viên; vãng lai dùng mã đơn + email) | |
| OD-06 | Lịch sử đơn của thành viên | |
| IN-01 | Đồng bộ sản phẩm, giá, tồn kho từ Main (IF-01, IF-02) | Worker kéo định kỳ |
| IN-02 | Kiểm tra tồn kho (IF-03), gửi đơn (IF-04), nhận trạng thái (IF-05) | |

### 2.2 Không làm
Xem mục 15. Tóm tắt: không thanh toán trực tuyến, không trang quản trị, không sổ địa chỉ nhiều địa chỉ, không hủy tài khoản, không hủy đơn (IF-06), không xác thực email, không SMS, không microservice/gateway/Redis/Meilisearch.

---

## 3. Giả định

| Mã | Giả định |
|---|---|
| GĐ1 | Chỉ COD; đơn vị vận chuyển thu tiền |
| GĐ2 | Main System là nguồn gốc sản phẩm, giá, tồn kho; website chỉ đọc |
| GĐ3 | Main System điều phối giao hàng, báo trạng thái qua IF-05 |
| GĐ4 | Giao diện Main System chưa chốt → dùng mock; module `integration` tách riêng để thay sau |
| GĐ6 | Khách vãng lai được đặt hàng |

---

## 4. Công nghệ

| Thành phần | Lựa chọn |
|---|---|
| Ứng dụng | **Next.js 14 (App Router) full-stack**, TypeScript strict, Tailwind CSS. API viết bằng Route Handlers dưới `app/api` |
| CSDL | **MySQL 8.4** (`utf8mb4`, collation `utf8mb4_0900_ai_ci`), Prisma ORM |
| Xác thực | JWT (thư viện `jose`) trong cookie `httpOnly; SameSite=Lax`, hạn 7 ngày; mật khẩu băm `bcryptjs` |
| Validate | zod |
| Email | nodemailer → Mailpit |
| Worker tích hợp | Script Node chạy bằng `tsx` (`worker/index.ts`) |
| Mock Main System | Server Fastify nhỏ (`mock-main/`), dữ liệu trong bộ nhớ |
| Test | Vitest (unit), Playwright (E2E, chỉ Chromium), k6 (tải) |
| Hạ tầng dev | `docker-compose.yml` chỉ gồm `mysql:8.4` và `axllent/mailpit` |

Lệnh gốc trong `package.json`: `dev` (chạy song song Next.js + worker + mock), `db:migrate`, `db:seed`, `sync`, `test`, `test:e2e`, `test:load`, `lint`, `typecheck`.

---

## 5. Kiến trúc và cấu trúc repo

Một ứng dụng Next.js, bên trong chia module đúng theo ba nhóm chức năng của RFP và adapter tích hợp trong thiết kế:

```
Trình duyệt ─► Next.js (trang + /api) ─► modules: catalog | member | order ─► MySQL (Selling DB)
                                              │
                                              └─► integration ◄──► Mock Main System
worker (tsx) ─► integration: đồng bộ sản phẩm/tồn kho, gửi đơn có thử lại
```

```
/
├─ app/                         # trang và route handlers (/api/...)
├─ components/                  # UI dùng chung
├─ src/
│  ├─ modules/
│  │  ├─ catalog/               # PS
│  │  ├─ member/                # MA
│  │  ├─ order/                 # OD
│  │  └─ integration/           # IF-01..05, MainSystemClient, sync_log
│  └─ lib/                      # db, auth, email, errors, money, order-state, config
├─ worker/index.ts
├─ mock-main/                   # server.ts, seed.json, generate-seed.ts
├─ prisma/                      # schema.prisma, seed.ts
├─ config/shipping-methods.json
├─ tests/{unit,e2e,load}
├─ docker-compose.yml
├─ README.md, DECISIONS.md, PROGRESS.md
```

Quy tắc: route handler chỉ gọi hàm trong `src/modules/*`; module này không import module kia trừ qua hàm public (`index.ts`).

---

## 6. Dữ liệu (MySQL, 9 bảng)

```prisma
datasource db { provider = "mysql"  url = env("DATABASE_URL") }
generator client { provider = "prisma-client-js" }

model Category {
  id        String     @id @db.VarChar(64)       // mã Main System
  parentId  String?    @db.VarChar(64)
  parent    Category?  @relation("Tree", fields: [parentId], references: [id])
  children  Category[] @relation("Tree")
  name      String     @db.VarChar(191)
  slug      String     @unique @db.VarChar(191)
  products  Product[]
  @@map("category")
}

model Product {
  id          String           @id @db.VarChar(64)
  categoryId  String           @db.VarChar(64)
  category    Category         @relation(fields: [categoryId], references: [id])
  name        String           @db.VarChar(255)
  description String           @db.Text
  images      Json                                 // mảng URL
  isActive    Boolean
  createdAt   DateTime         @default(now()) @db.DateTime(3)
  syncedAt    DateTime         @db.DateTime(3)
  variants    ProductVariant[]
  @@index([categoryId, isActive])
  @@index([name])
  @@map("product")
}

model ProductVariant {
  sku          String  @id @db.VarChar(64)
  productId    String  @db.VarChar(64)
  product      Product @relation(fields: [productId], references: [id])
  size         String  @db.VarChar(16)
  color        String  @db.VarChar(64)
  price        Int                                  // VND
  availableQty Int
  @@index([productId])
  @@index([price])
  @@map("product_variant")
}

model Member {
  id            String    @id @default(uuid()) @db.Char(36)
  email         String    @unique @db.VarChar(191)  // chữ thường
  passwordHash  String    @db.VarChar(255)
  fullName      String    @db.VarChar(191)
  phone         String?   @db.VarChar(20)
  // một địa chỉ giao mặc định (thay sổ địa chỉ)
  shipLine1     String?   @db.VarChar(255)
  shipWard      String?   @db.VarChar(100)
  shipDistrict  String?   @db.VarChar(100)
  shipProvince  String?   @db.VarChar(100)
  failedLogins  Int       @default(0)
  lockedUntil   DateTime? @db.DateTime(3)
  createdAt     DateTime  @default(now()) @db.DateTime(3)
  orders        Order[]
  @@map("member")
}

model Cart {
  id        String     @id @default(uuid()) @db.Char(36)
  memberId  String?    @unique @db.Char(36)
  sessionId String?    @unique @db.Char(36)
  items     CartItem[]
  @@map("cart")
}

model CartItem {
  cartId   String @db.Char(36)
  cart     Cart   @relation(fields: [cartId], references: [id], onDelete: Cascade)
  sku      String @db.VarChar(64)
  quantity Int
  @@id([cartId, sku])
  @@map("cart_item")
}

model Order {
  id             String      @id @default(uuid()) @db.Char(36)
  code           String      @unique @db.VarChar(20)        // ABC-YYMMDD-XXXXX
  idempotencyKey String      @unique @db.Char(36)
  memberId       String?     @db.Char(36)
  member         Member?     @relation(fields: [memberId], references: [id])
  customerName   String      @db.VarChar(191)
  customerEmail  String      @db.VarChar(191)
  customerPhone  String      @db.VarChar(20)
  shipLine1      String      @db.VarChar(255)               // bản chụp địa chỉ
  shipWard       String      @db.VarChar(100)
  shipDistrict   String      @db.VarChar(100)
  shipProvince   String      @db.VarChar(100)
  shippingMethod String      @db.VarChar(32)
  shippingFee    Int
  itemsTotal     Int
  codAmount      Int
  status         OrderStatus @default(CONFIRMED)
  // hàng đợi gửi Main (thay bảng outbox)
  sendAttempts   Int         @default(0)
  nextSendAt     DateTime?   @default(now()) @db.DateTime(3) // null = không cần gửi nữa
  lastSendError  String?     @db.Text
  mainOrderId    String?     @db.VarChar(64)
  trackingNumber String?     @db.VarChar(64)
  createdAt      DateTime    @default(now()) @db.DateTime(3)
  updatedAt      DateTime    @updatedAt @db.DateTime(3)
  items          OrderItem[]
  @@index([memberId, createdAt])
  @@index([status, nextSendAt])
  @@map("orders")
}
enum OrderStatus { CONFIRMED SENT_TO_MAIN PICKING SHIPPING DELIVERED DELIVERY_FAILED }

model OrderItem {
  id          String @id @default(uuid()) @db.Char(36)
  orderId     String @db.Char(36)
  order       Order  @relation(fields: [orderId], references: [id])
  sku         String @db.VarChar(64)
  productName String @db.VarChar(255)   // bản chụp
  size        String @db.VarChar(16)
  color       String @db.VarChar(64)
  unitPrice   Int
  quantity    Int
  @@map("order_item")
}

model SyncLog {
  id        String   @id @default(uuid()) @db.Char(36)
  direction String   @db.VarChar(3)     // IN | OUT
  iface     String   @db.VarChar(8)     // IF-01..IF-05
  recordKey String?  @db.VarChar(64)
  result    String   @db.VarChar(8)     // OK | ERROR | RETRY
  message   String?  @db.Text
  createdAt DateTime @default(now()) @db.DateTime(3)
  @@index([iface, createdAt])
  @@map("sync_log")
}
```

Máy trạng thái đơn (hàm thuần `transition()` trong `src/lib/order-state.ts`, có unit test):
`CONFIRMED → SENT_TO_MAIN → PICKING → SHIPPING → DELIVERED`; từ `SHIPPING` có thể sang `DELIVERY_FAILED`. Chuyển không hợp lệ → bỏ qua, ghi `sync_log` ERROR.

---

## 7. Quy tắc nghiệp vụ

| Mã | Quy tắc |
|---|---|
| QT1 | Tồn kho kiểm hai lần: khi thêm vào giỏ (so `availableQty` local), khi đặt hàng (gọi IF-03 — lần quyết định) |
| QT2 | Đơn lưu bản chụp địa chỉ, tên, size, màu, đơn giá |
| QT3 | Đặt hàng thành công → đơn `CONFIRMED`, `nextSendAt = now`; worker gửi sang Main |
| QT5 | Giá tính ở server từ `ProductVariant.price`, không tin giá client |
| QT6 | Không bán biến thể `availableQty <= 0` hoặc sản phẩm `isActive = false` → "Tạm hết hàng" |
| QT7 | Mỗi dòng giỏ 1–10 sản phẩm |
| QT8 | `POST /api/orders` nhận header `Idempotency-Key`; trùng key → trả đơn đã có |
| QT9 | Sai mật khẩu 5 lần → khóa 15 phút |
| QT10 | Đăng nhập → gộp giỏ vãng lai vào giỏ thành viên (cộng số lượng, tối đa 10) |

---

## 8. API (route handlers)

Lỗi trả `{ "error": { "code", "message" } }`, message tiếng Việt, nói rõ khách cần làm gì. Mã lỗi: `VALIDATION_ERROR, UNAUTHORIZED, NOT_FOUND, ACCOUNT_LOCKED, EMAIL_TAKEN, TOKEN_INVALID, CART_EMPTY, OUT_OF_STOCK, NOT_PURCHASABLE, MAIN_UNAVAILABLE`.

| Method | Path | Use case |
|---|---|---|
| GET | `/api/categories` | PS-03 |
| GET | `/api/products?q&category&size&color&minPrice&maxPrice&sort&page` | PS-01, 02, 03 |
| GET | `/api/products/[id]` | PS-04 |
| POST | `/api/auth/register` | MA-01 |
| POST | `/api/auth/login`, `/api/auth/logout` | MA-02 |
| POST | `/api/auth/forgot-password`, `/api/auth/reset-password` | MA-03 (token ký JWT, hạn 30 phút, gửi qua email) |
| GET, PATCH | `/api/me` | MA-04 |
| POST | `/api/me/change-password` | MA-03 |
| GET | `/api/cart`; POST `/api/cart/items`; PATCH, DELETE `/api/cart/items/[sku]` | OD-01 |
| GET | `/api/shipping-methods` | OD-03 |
| POST | `/api/orders` | OD-02, OD-03 |
| GET | `/api/orders`, `/api/orders/[code]` | OD-05, OD-06 |
| POST | `/api/orders/lookup` `{ code, email }` | OD-05 |
| POST | `/api/integration/order-status` (webhook từ Main, header `x-main-secret`) | IF-05 |
| GET | `/api/healthz` | NFR |

Luồng `POST /api/orders`:
1. Trùng `Idempotency-Key` → trả đơn cũ.
2. Giỏ rỗng → `CART_EMPTY`; vi phạm QT6 → `NOT_PURCHASABLE`.
3. Gọi IF-03 (timeout 3 giây). Thiếu hàng → `OUT_OF_STOCK` kèm SKU. Main không trả lời → `MAIN_UNAVAILABLE`, không tạo đơn.
4. Transaction: tạo `Order` + `OrderItem`, xóa giỏ.
5. Gửi email xác nhận (lỗi email chỉ ghi log).
6. Trả `201 { code, codAmount }`.

---

## 9. Tích hợp Main System

### 9.1 Module `src/modules/integration`
```ts
interface MainSystemClient {
  fetchCatalog(): Promise<CatalogSnapshot>;                                // IF-01
  fetchStock(): Promise<{ sku: string; qty: number }[]>;                  // IF-02
  checkStock(lines: { sku: string; qty: number }[]): Promise<StockCheckResult>; // IF-03
  sendOrder(order: MainOrderPayload): Promise<{ mainOrderId: string }>;   // IF-04, idempotent theo order.id
}
```
Cài đặt `HttpMainSystemClient` gọi mock qua `MAIN_SYSTEM_URL`. Mỗi lần gọi ghi một dòng `sync_log`.

### 9.2 Worker (`worker/index.ts`)
| Việc | Chu kỳ | Hành vi |
|---|---|---|
| IF-01 đồng bộ sản phẩm | Khi khởi động + mỗi 10 phút; chạy tay bằng `pnpm sync` | Upsert category/product/variant (trừ tồn kho); sản phẩm không còn trong snapshot → `isActive = false` |
| IF-02 đồng bộ tồn kho | Mỗi 1 phút | Cập nhật `availableQty` |
| IF-04 gửi đơn | Mỗi 5 giây | Lấy đơn `CONFIRMED` có `nextSendAt <= now` (lô 20). Thành công → `SENT_TO_MAIN`, lưu `mainOrderId`, `nextSendAt = null`. Lỗi → `sendAttempts++`, `nextSendAt = now + min(5s × 2^attempts, 10 phút)`; sau 10 lần → `nextSendAt = null`, ghi log ERROR |

### 9.3 IF-05 webhook
Main gọi `POST /api/integration/order-status` `{ mainOrderId, status, trackingNumber? }`. Kiểm `x-main-secret`, áp `transition()`, gửi lặp cùng trạng thái → bỏ qua (idempotent), gửi email cho khách khi chuyển `SHIPPING` hoặc `DELIVERED`.

### 9.4 Mock Main System (`mock-main/`, port 4100)
- Seed tất định: 6 danh mục (2 cấp), 40 sản phẩm, mỗi sản phẩm 3–4 size × 1–2 màu, ảnh placeholder, vài SKU tồn kho 0.
- Cho website: `GET /main/catalog`, `GET /main/stock`, `POST /main/stock-check`, `POST /main/orders` (idempotent theo id).
- Để test và demo: `POST /sim/orders/:mainOrderId/advance` (đẩy sang trạng thái kế tiếp và gọi webhook IF-05; body tùy chọn `{ "to": "DELIVERY_FAILED" }`), `POST /sim/stock { sku, qty }`, `POST /sim/fail-mode { mode: "timeout" | "error" | "none" }`.
- Trang `/sim` HTML đơn giản liệt kê đơn đã nhận và nút "Chuyển trạng thái", phục vụ demo.

---

## 10. Giao diện

Header trên mọi trang: logo, ô tìm kiếm, giỏ (số lượng), Đăng nhập/Tài khoản, "Tra cứu đơn". Responsive; trên di động danh mục thu vào nút menu.

| Route | Màn hình | Use case |
|---|---|---|
| `/` | Trang chủ: danh mục, sản phẩm mới | — |
| `/danh-muc/[slug]` | Danh sách + bộ lọc + sắp xếp + phân trang | PS-02, PS-03 |
| `/tim-kiem?q=` | Kết quả tìm kiếm + bộ lọc | PS-01, PS-02 |
| `/san-pham/[id]` | Chi tiết, chọn size/màu, thêm giỏ | PS-04, OD-01 |
| `/gio-hang` | Giỏ hàng | OD-01 |
| `/dat-hang` | 3 bước: (1) thông tin + địa chỉ → (2) phương thức giao + tổng COD → (3) xác nhận | OD-02, OD-03 |
| `/dat-hang/hoan-tat/[code]` | Mã đơn, số tiền COD | OD-04 |
| `/tra-cuu-don` | Mã đơn + email → trạng thái | OD-05 |
| `/dang-ky`, `/dang-nhap` | | MA-01, MA-02 |
| `/quen-mat-khau`, `/dat-lai-mat-khau` | | MA-03 |
| `/tai-khoan` | Hồ sơ + địa chỉ mặc định + đổi mật khẩu | MA-03, MA-04 |
| `/tai-khoan/don-hang`, `/tai-khoan/don-hang/[code]` | Lịch sử, chi tiết, dòng thời gian trạng thái | OD-05, OD-06 |

Giá hiển thị `499.000 ₫`. Thành viên đặt hàng thì điền sẵn địa chỉ mặc định. Mỗi trang có trạng thái đang tải, rỗng, lỗi.

---

## 11. Phi chức năng (mức tối thiểu cần có)

| Mã | Làm gì |
|---|---|
| NF-01 (< 2s) | Chỉ mục ở mục 6; trang danh mục và chi tiết render phía server; `tests/load/k6.js` 100 VU trong 2 phút, cơ cấu tìm 40% / chi tiết 30% / đăng nhập 20% / đặt hàng 10%, threshold `http_req_duration: max<2000`, `http_req_failed: rate<0.01` |
| NF-02 (24/365) | Không giữ trạng thái trong bộ nhớ tiến trình web; `/api/healthz` kiểm DB; worker có thử lại; README có đoạn "Chạy nhiều instance" (mô tả, không cần dựng) |
| NF-04 (dễ dùng) | Đặt hàng 3 bước, không bắt đăng nhập, thông báo lỗi tiếng Việt |
| NF-06, NF-07 (bảo mật) | bcrypt; cookie httpOnly; zod validate mọi input; chỉ chủ đơn xem được đơn của mình; Prisma (không SQL ghép chuỗi) |
| NF-08 (truy vết) | `sync_log` cho mọi lần gọi Main; log console khi đăng nhập, đặt hàng |

---

## 12. Milestone

7 milestone, làm tuần tự. Mỗi milestone có mục tiêu, đầu việc đánh số theo thứ tự làm, cách kiểm tra và điều kiện hoàn thành (DoD). Điều kiện chung cho mọi milestone: `pnpm lint && pnpm typecheck && pnpm test` xanh, ứng dụng chạy được bằng `pnpm dev`, commit `M<n>: …`, cập nhật `PROGRESS.md`.

### M0 — Khung dự án và hạ tầng dev
**Mục tiêu:** một lệnh dựng được môi trường; web, worker và mock cùng chạy.

1. Khởi tạo Next.js 14 (App Router) + TypeScript strict + Tailwind + ESLint/Prettier; pnpm.
2. `docker-compose.yml`: `mysql:8.4` (DB `selling`, charset `utf8mb4`, collation `utf8mb4_0900_ai_ci`, volume) và `axllent/mailpit` (1025/8025); healthcheck cho cả hai.
3. `.env.example` theo mục 16; `src/lib/config.ts` đọc env bằng zod, thiếu biến thì dừng với thông báo rõ.
4. Khung `worker/index.ts` và `mock-main/server.ts` (Fastify, port 4100) chỉ có log khởi động và `/healthz`.
5. Script `pnpm dev` chạy song song Next.js, worker, mock (dùng `concurrently`).
6. Tạo `README.md` (cách chạy), `DECISIONS.md`, `PROGRESS.md` (checklist M0–M6 copy từ mục này).

**Kiểm tra:** `docker compose up -d && pnpm install && pnpm dev`, mở `http://localhost:3000` và `http://localhost:4100/healthz`.
**DoD:** ba tiến trình chạy không lỗi; MySQL và Mailpit healthy.

### M1 — CSDL, thư viện dùng chung, mock Main System, đồng bộ sản phẩm (IF-01, IF-02)
**Mục tiêu:** dữ liệu sản phẩm chảy từ mock vào Selling DB.

1. `prisma/schema.prisma` theo mục 6; migration `init`; `src/lib/db.ts` (Prisma client singleton).
2. `src/lib/errors.ts`: mã lỗi mục 8, lớp `AppError`, hàm `toErrorResponse()` dùng cho mọi route handler; lỗi zod → `VALIDATION_ERROR`.
3. `src/lib/money.ts` (định dạng `499.000 ₫`), `src/lib/order-code.ts` (`ABC-YYMMDD-XXXXX`), `src/lib/order-state.ts` (`transition()` theo mục 6) + unit test đủ cạnh hợp lệ và không hợp lệ.
4. `mock-main/generate-seed.ts` sinh `seed.json` tất định (mục 9.4); mock nạp seed vào bộ nhớ; endpoint `GET /main/catalog`, `GET /main/stock`.
5. `src/modules/integration`: interface `MainSystemClient`, `HttpMainSystemClient` (timeout `MAIN_TIMEOUT_MS`), hàm ghi `sync_log`.
6. Hàm `syncCatalog()` (IF-01: upsert theo lô, `isActive=false` cho sản phẩm vắng mặt) và `syncStock()` (IF-02); worker gọi theo chu kỳ mục 9.2; lệnh `pnpm sync`.
7. Test integration cho `syncCatalog()` chạy với mock thật.

**Kiểm tra:** `pnpm db:migrate && pnpm sync`, đếm bản ghi bằng Prisma Studio hoặc SQL.
**DoD:** 6 danh mục, 40 sản phẩm, số biến thể khớp seed; mỗi lần đồng bộ có dòng `sync_log`; unit test `order-state` xanh.

### M2 — Tìm kiếm và duyệt sản phẩm (PS-01 → PS-04)
**Mục tiêu:** khách tìm, lọc, xem chi tiết sản phẩm.

1. `src/modules/catalog`: `getCategoryTree()`, `listProducts(filters)` (lọc size/màu/giá qua biến thể, chỉ `isActive`, tìm `LIKE` trên tên + mô tả, danh mục cha gồm cả con, sắp xếp, phân trang 24), `getProduct(id)` kèm cờ `purchasable` theo QT6.
2. Route handlers `/api/categories`, `/api/products`, `/api/products/[id]`.
3. Layout chung: header (logo, ô tìm, giỏ placeholder, tài khoản placeholder, "Tra cứu đơn"), menu danh mục, responsive.
4. Trang `/`, `/danh-muc/[slug]`, `/tim-kiem`, `/san-pham/[id]` render phía server; bộ lọc đồng bộ với query string.
5. Component `ProductCard`, `FilterPanel`, `SortSelect`, `Pagination`, `PriceTag`, `VariantPicker`, `StockBadge`.
6. Cài Playwright (Chromium); E2E PS-01 → PS-04 theo mục 14.

**DoD:** E2E PS-01 → PS-04 xanh.

### M3 — Thành viên (MA-01 → MA-04)
**Mục tiêu:** đăng ký, đăng nhập, quản lý hồ sơ.

1. `src/lib/auth.ts`: ký/đọc JWT (`jose`), đặt/xóa cookie, `getCurrentMember()`.
2. `src/modules/member`: `register()` (bcrypt, email chữ thường, `EMAIL_TAKEN`), `login()` (QT9), `updateProfile()` (họ tên, SĐT, địa chỉ mặc định), `changePassword()` (cần mật khẩu cũ).
3. `src/lib/email.ts` (nodemailer → Mailpit) + template email đặt lại mật khẩu; `requestPasswordReset()` luôn trả thành công, `resetPassword()` với token JWT hạn 30 phút.
4. Route handlers `/api/auth/*`, `/api/me`, `/api/me/change-password`.
5. Trang `/dang-ky`, `/dang-nhap`, `/quen-mat-khau`, `/dat-lai-mat-khau`, `/tai-khoan`; `middleware.ts` chuyển `/tai-khoan/*` về `/dang-nhap` khi chưa đăng nhập; header hiển thị tên thành viên và nút đăng xuất.
6. Helper E2E đọc email từ API Mailpit (`http://localhost:8025/api/v1/messages`); E2E MA-01 → MA-04; test khóa tài khoản sau 5 lần sai.

**DoD:** E2E MA-01 → MA-04 xanh.

### M4 — Giỏ hàng và đặt hàng COD (OD-01 → OD-04, IF-03, IF-04)
**Mục tiêu:** vãng lai và thành viên đặt được đơn COD; đơn tự sang Main System.

1. Cookie `sid` cho khách vãng lai; `src/modules/order/cart.ts`: lấy/tạo giỏ theo thành viên hoặc `sid`, thêm/sửa/xóa với QT1, QT7; `mergeGuestCart()` (QT10) gọi sau đăng nhập.
2. Route handlers `/api/cart`, `/api/cart/items`, `/api/cart/items/[sku]`; badge số lượng trên header.
3. `config/shipping-methods.json` (mẫu: Tiêu chuẩn 30.000 ₫, Nhanh 50.000 ₫); `/api/shipping-methods`.
4. Mock: `POST /main/stock-check`, `POST /main/orders` (idempotent theo id), `POST /sim/fail-mode`. Integration: `checkStock()`, `sendOrder()`.
5. `src/modules/order/place-order.ts` đúng luồng mục 8 (idempotency, QT5, QT6, IF-03, transaction, xóa giỏ); `POST /api/orders`.
6. Template + gửi email xác nhận đơn (OD-04).
7. Worker IF-04: `sendPendingOrders()` theo mục 9.2 (thử lại lũy thừa, tối đa 10 lần).
8. Trang `/gio-hang`, `/dat-hang` (3 bước, điền sẵn địa chỉ cho thành viên, sinh `Idempotency-Key` một lần cho mỗi lượt đặt), `/dat-hang/hoan-tat/[code]`.
9. Test: integration `placeOrder()` (đủ hàng, thiếu hàng, Main timeout → `MAIN_UNAVAILABLE`, cùng key 2 lần → 1 đơn); worker gửi lại sau lỗi và mock không nhận trùng; E2E OD-01 → OD-04 cho vãng lai và thành viên.

**DoD:** đơn mới sang `SENT_TO_MAIN` trong ≤ 10 giây; test mục 9 xanh.

### M5 — Theo dõi đơn (OD-05, OD-06, IF-05)
**Mục tiêu:** khách thấy trạng thái đơn cập nhật từ Main System.

1. Mock: `POST /sim/orders/:mainOrderId/advance` gọi webhook IF-05 kèm `x-main-secret`; trang HTML `/sim` liệt kê đơn và nút chuyển trạng thái (cho demo); `POST /sim/stock`.
2. Route `POST /api/integration/order-status` theo mục 9.3 (kiểm secret, `transition()`, idempotent, ghi `sync_log`); email khi `SHIPPING`, `DELIVERED`.
3. `src/modules/order/queries.ts`: `listMemberOrders()`, `getMemberOrder(code)` (chỉ chủ đơn), `lookupGuestOrder(code, email)`.
4. Route `/api/orders`, `/api/orders/[code]`, `/api/orders/lookup`.
5. Trang `/tai-khoan/don-hang`, `/tai-khoan/don-hang/[code]` (dòng thời gian trạng thái, mã vận đơn), `/tra-cuu-don`.
6. E2E: đặt hàng → advance ở mock → trang chi tiết hiện trạng thái mới; tra cứu sai email → "Không tìm thấy đơn"; thành viên A không xem được đơn của B; đổi tồn kho bằng `/sim/stock` → web cập nhật sau ≤ 1 phút.

**DoD:** E2E OD-05, OD-06, IN-01, IN-02 xanh. **Từ sau M5 đóng băng tính năng.**

### M6 — Phi chức năng và bàn giao
**Mục tiêu:** có bằng chứng cho ba nguyên tắc của RFP và tài liệu để demo.

1. `EXPLAIN` truy vấn `listProducts`, thêm chỉ mục nếu cần, ghi vào `DECISIONS.md`.
2. `/api/healthz` (kiểm kết nối DB); rà để tiến trình web không giữ trạng thái trong bộ nhớ.
3. `tests/load/k6.js` theo NF-01 (100 VU, 2 phút); chạy, lưu kết quả vào `tests/load/result.md`.
4. Rà giao diện: thông báo lỗi tiếng Việt, trạng thái đang tải/rỗng/lỗi, hiển thị ở khổ màn hình 375px.
5. README hoàn chỉnh: cài đặt, chạy, test, mục "Chạy nhiều instance" (NF-02), kịch bản demo từng bước (tìm → đặt hàng vãng lai → mock chuyển trạng thái → tra cứu → đăng ký → lịch sử), bảng truy vết use case → trang → API → file test.
6. Chạy lại toàn bộ unit + E2E; cập nhật `DECISIONS.md`, `PROGRESS.md`.

**DoD:** k6 đạt threshold; toàn bộ test xanh; người khác clone repo làm theo README chạy được demo trong 15 phút.

---

## 13. Sprint

Tuần làm việc chia 3 sprint. Mỗi sprint kết thúc bằng một buổi review ngắn: demo phần chạy được, đối chiếu DoD, quyết định phần dời sang sprint sau.

| Sprint | Thời lượng | Mục tiêu | Milestone | Demo cuối sprint |
|---|---|---|---|---|
| Sprint 1 — Nền tảng và sản phẩm | khoảng 2 ngày | Dữ liệu từ Main System hiển thị trên web; khách tìm và xem được sản phẩm | M0, M1, M2 | Chạy `pnpm sync`, tìm "ao thun", lọc size, xem chi tiết, biến thể hết hàng bị khóa |
| Sprint 2 — Thành viên và đặt hàng | khoảng 2,5 ngày | Khách đăng ký, đặt được đơn COD; đơn tự sang Main | M3, M4 | Đăng ký → thêm giỏ → đặt hàng 3 bước → email xác nhận trong Mailpit → đơn hiện ở mock |
| Sprint 3 — Theo dõi đơn, chất lượng, bàn giao | khoảng 2,5 ngày (gồm dự phòng) | Trạng thái đơn hai chiều; bằng chứng NFR; tài liệu demo | M5, M6 | Kịch bản demo đầy đủ theo README + kết quả k6 |

### Sprint 1 — Nền tảng và sản phẩm
Backlog:
- [ ] M0 bước 1–6
- [ ] M1 bước 1–7
- [ ] M2 bước 1–6

Rủi ro chính: cấu hình MySQL/Prisma (collation, shadow DB). Nếu vướng quá nửa buổi, dùng user root ở dev và ghi vào `DECISIONS.md`.
**Hoàn thành sprint khi:** DoD M0, M1, M2 đạt.

### Sprint 2 — Thành viên và đặt hàng
Backlog:
- [ ] M3 bước 1–6
- [ ] M4 bước 1–9

Rủi ro chính: luồng đặt hàng và worker (M4 bước 5, 7). Làm M4 bước 4–7 trước giao diện bước 8, để logic có test sớm.
**Hoàn thành sprint khi:** DoD M3, M4 đạt.

### Sprint 3 — Theo dõi đơn, chất lượng, bàn giao
Backlog:
- [ ] M5 bước 1–6
- [ ] M6 bước 1–6
- [ ] Sửa lỗi tồn đọng từ Sprint 1–2

**Hoàn thành sprint khi:** DoD M5, M6 đạt.

### Quy tắc khi bị trễ
Nếu cuối một sprint chưa đạt DoD, phần dở dang chuyển sang đầu sprint sau. Nếu sprint 3 không đủ thời gian, cắt theo thứ tự dưới đây (không cắt gì thuộc mục 1):
1. Trang HTML `/sim` của mock (demo bằng lệnh `curl` thay thế)
2. Email khi đơn chuyển `SHIPPING` / `DELIVERED`
3. Quên mật khẩu qua email (giữ đổi mật khẩu)
4. Chạy k6 (giữ script, ghi kết quả đo thủ công thời gian phản hồi bằng DevTools)

### Gợi ý dùng model (gói Pro)
- Opus: M1 (đồng bộ), M4 (đặt hàng, worker) và các lỗi khó.
- Sonnet: còn lại (giao diện, CRUD, test).
- Mở phiên mới (`/clear`) ở đầu mỗi milestone; kiểm `/usage` cuối mỗi sprint.

---

## 14. Tiêu chí nghiệm thu

| Use case | Tiêu chí |
|---|---|
| PS-01 | Gõ "ao thun" (không dấu) → ra sản phẩm "Áo thun …" |
| PS-02 | Lọc size M + khoảng giá → chỉ sản phẩm có biến thể thỏa; sắp xếp giá đúng |
| PS-03 | Bấm danh mục cha → thấy sản phẩm cả danh mục con |
| PS-04 | Biến thể hết hàng → nút "Thêm vào giỏ" bị khóa, ghi "Tạm hết hàng" |
| MA-01 | Email trùng → báo lỗi; email mới → đăng nhập được ngay |
| MA-02 | Sai mật khẩu 5 lần → bị khóa 15 phút; đăng nhập xong giỏ vãng lai được gộp |
| MA-03 | Link đặt lại mật khẩu dùng được trong 30 phút; đổi mật khẩu cần mật khẩu cũ |
| MA-04 | Sửa họ tên, SĐT, địa chỉ mặc định → lưu; lần đặt hàng sau được điền sẵn |
| OD-01 | Thêm quá tồn kho hoặc quá 10 → báo lỗi rõ |
| OD-02 | Vãng lai đặt hàng thành công; sửa địa chỉ hồ sơ sau đó không làm đổi đơn cũ |
| OD-03 | Tổng COD = tiền hàng + phí giao theo phương thức chọn |
| OD-04 | Email xác nhận có mã đơn, danh sách hàng, tổng COD |
| OD-05 | Đúng mã + email → thấy trạng thái; sai → "Không tìm thấy đơn" |
| OD-06 | Thành viên chỉ thấy đơn của mình, mới nhất trước |
| IN-01 | Đổi tồn kho ở mock → sau ≤ 1 phút web hiển thị đúng |
| IN-02 | Mock lỗi tạm thời → worker gửi lại, đơn cuối cùng sang `SENT_TO_MAIN`, mock không nhận trùng; chuyển trạng thái ở mock → web cập nhật |

---

## 15. Đã lược bỏ so với bản đầy đủ

| Hạng mục | Lý do | Cách trình bày khi báo cáo |
|---|---|---|
| 6 service + API gateway + Nginx + nhiều instance | Quá nặng cho 1 tuần | Code đã chia module đúng ranh giới 3 service + adapter; tách service là bước giai đoạn 2 |
| Redis, Meilisearch | 40–60 sản phẩm không cần | MySQL đủ nhanh ở quy mô demo; k6 chứng minh < 2s |
| MA-05 sổ địa chỉ, MA-06 hủy tài khoản | Use case mức "Should" | Thay bằng một địa chỉ mặc định trong hồ sơ |
| OD-07 hủy đơn, IF-06 | Use case mức "Should" | Giai đoạn 2 |
| Xác thực email khi đăng ký, SMS OTP | Không bắt buộc trong RFP | Giai đoạn 2 |
| Refresh token, CSRF token riêng | Đơn giản hóa xác thực | Cookie `SameSite=Lax` + httpOnly đủ cho demo |
| Bảng outbox riêng, job đối soát | Gộp vào cột trên bảng `orders` | Vẫn đảm bảo không mất, không trùng đơn |
| HMAC webhook | Thay bằng secret header | Giai đoạn 2 |
| E2E đa trình duyệt, ZAP, chaos test, backup/restore | Thời gian | Chạy Chromium; mô tả trong báo cáo |
| Runbook go-live, chế độ bảo trì, compose production | Thời gian | Giai đoạn 2 |

---

## 16. Biến môi trường (`.env.example`)

```
DATABASE_URL=mysql://root:root@localhost:3306/selling
JWT_SECRET=change-me
MAIN_SYSTEM_URL=http://localhost:4100
MAIN_WEBHOOK_SECRET=change-me
WEB_BASE_URL=http://localhost:3000
SMTP_URL=smtp://localhost:1025
MAIL_FROM="ABC Wear <no-reply@abcwear.local>"
MAIN_TIMEOUT_MS=3000
```
