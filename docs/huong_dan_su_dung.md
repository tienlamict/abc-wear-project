# Hướng dẫn chạy và kiểm thử hệ thống ABC Wear

Tài liệu dành cho người cài đặt, chạy thử và kiểm thử Web Site Selling System (ABC Wear): từ chuẩn bị máy,
chạy hệ thống, kiểm thử thủ công từng chức năng đến chạy bộ kiểm thử tự động và kiểm thử tải.
Tổng quan kỹ thuật xem [README.md](../README.md); đặc tả xem [spec.md](../spec.md).

**Mục lục**

1. [Hệ thống gồm những gì](#1-hệ-thống-gồm-những-gì)
2. [Chuẩn bị máy](#2-chuẩn-bị-máy)
3. [Cài đặt lần đầu](#3-cài-đặt-lần-đầu)
4. [Chạy hệ thống](#4-chạy-hệ-thống)
5. [Dữ liệu mẫu và tài khoản](#5-dữ-liệu-mẫu-và-tài-khoản)
6. [Công cụ hỗ trợ kiểm thử](#6-công-cụ-hỗ-trợ-kiểm-thử)
7. [Kiểm thử thủ công theo chức năng](#7-kiểm-thử-thủ-công-theo-chức-năng)
8. [Kiểm thử tự động](#8-kiểm-thử-tự-động)
9. [Kiểm thử tải (k6)](#9-kiểm-thử-tải-k6)
10. [Xử lý sự cố](#10-xử-lý-sự-cố)
11. [Đặt lại dữ liệu và dọn dẹp](#11-đặt-lại-dữ-liệu-và-dọn-dẹp)

---

## 1. Hệ thống gồm những gì

```
 Trình duyệt ──► Web (Next.js, :3000) ──► MySQL 8.4 (:3306, Docker)
                      ▲    │
          webhook IF-05│    │ IF-03 kiểm kho khi đặt hàng
                      │    ▼
                Mock Main System (:4100) ◄── Worker: IF-01 sản phẩm, IF-02 tồn kho, IF-04 gửi đơn
                                                │
 Email ──────────────────────────────────────► Mailpit (SMTP :1025, web :8025, Docker)
```

| Thành phần       | Địa chỉ                         | Vai trò                                                                                   |
| ---------------- | ------------------------------- | ----------------------------------------------------------------------------------------- |
| Web              | http://localhost:3000           | Website bán hàng (trang + API `/api/...`)                                                 |
| Worker           | (không có giao diện)            | Kéo sản phẩm mỗi 10 phút, tồn kho mỗi phút; gửi đơn sang Main mỗi 5 giây, lỗi thì thử lại |
| Mock Main System | http://localhost:4100/sim       | Giả lập hệ thống chính: nhận đơn, đổi trạng thái giao hàng, đổi tồn kho, giả lập sự cố    |
| MySQL 8.4        | `localhost:3306`, `root`/`root` | DB `selling` (dữ liệu chạy thử), `selling_test` (riêng cho test tự động)                  |
| Mailpit          | http://localhost:8025           | Hộp thư giả: mọi email của hệ thống đều vào đây, không gửi ra ngoài                       |

Mọi đơn hàng thanh toán khi nhận hàng (COD). Khách không cần tài khoản để đặt hàng.

## 2. Chuẩn bị máy

| Phần mềm      | Phiên bản                  | Kiểm tra         | Ghi chú                                                   |
| ------------- | -------------------------- | ---------------- | --------------------------------------------------------- |
| Node.js       | ≥ 20.12 (khuyến nghị 22)   | `node -v`        |                                                           |
| pnpm          | 9                          | `pnpm -v`        | Cài: `corepack enable pnpm` hoặc `npm i -g pnpm@9`        |
| Docker        | Docker Desktop (Win/macOS) | `docker version` | Docker phải **đang chạy** trước mọi bước dưới đây         |
| Git           | bất kỳ                     | `git --version`  |                                                           |
| Google Chrome | bản mới                    | —                | Chỉ cần cho kiểm thử E2E; có thể thay bằng Edge (mục 8.3) |

**Lưu ý trên Windows**

- Đặt mã nguồn ở thư mục có **đường dẫn ngắn**, ví dụ `D:\code\abc-wear`. Đường dẫn quá dài (khoảng 250 ký tự tính tới
  `node_modules\.pnpm\...`) làm Prisma Client không nạp được (lỗi `#main-entry-point is not defined`).
- Các lệnh trong tài liệu viết cho Git Bash. Trong PowerShell, thay `cp` bằng `Copy-Item`.
- Các cổng 3000, 4100, 3306, 1025, 8025 phải còn trống.

## 3. Cài đặt lần đầu

Làm một lần sau khi lấy mã nguồn. Thời gian khoảng 3–5 phút (lâu hơn nếu máy chưa từng tải các gói npm).

**Bước 1 — Lấy mã nguồn và vào thư mục dự án.**

```bash
git clone <địa-chỉ-repo> abc-wear
```

```bash
cd abc-wear
```

**Bước 2 — Tạo file cấu hình.** Giá trị mặc định trong `.env.example` dùng được ngay cho máy cá nhân.

```bash
cp .env.example .env
```

**Bước 3 — Khởi động MySQL và Mailpit.** `--wait` chờ đến khi cả hai sẵn sàng.

```bash
docker compose up -d --wait
```

Kết quả mong đợi: `Container abcwear-mysql Healthy` và `Container abcwear-mailpit Healthy`.

**Bước 4 — Cài thư viện.** Lệnh này tự sinh Prisma Client ở cuối (`postinstall: prisma generate`).

```bash
pnpm install
```

**Bước 5 — Tạo bảng trong DB.**

```bash
pnpm db:deploy
```

Kết quả mong đợi: `All migrations have been successfully applied.`

## 4. Chạy hệ thống

### 4.1 Chế độ phát triển (dùng cho chạy thử, demo, kiểm thử thủ công và E2E)

```bash
pnpm dev
```

Lệnh chạy cùng lúc ba tiến trình, log có tiền tố `[web]`, `[worker]`, `[mock]`. Trong khoảng 10–20 giây đầu:

- `[mock] [mock-main] listening on http://localhost:4100 (demo page: /sim)`
- `[worker] IF-01 catalog failed: ... ECONNREFUSED` có thể xuất hiện một lần nếu worker khởi động trước mock — **bình thường**,
  worker tự thử lại sau 15 giây.
- `[worker] IF-01 catalog: {"categories":6,"products":40,"variants":195,...}` và `[worker] IF-02 stock: ...` — dữ liệu đã vào DB.

Kiểm tra nhanh:

| Mở                                | Mong đợi                                       |
| --------------------------------- | ---------------------------------------------- |
| http://localhost:3000             | Trang chủ có danh mục Nam/Nữ và 8 sản phẩm mới |
| http://localhost:3000/api/healthz | `{"status":"ok","db":"ok",...}`                |
| http://localhost:4100/sim         | Trang "Mock Main System", chưa có đơn          |
| http://localhost:8025             | Giao diện Mailpit                              |

Ở chế độ dev, mỗi trang được biên dịch ở lần mở đầu tiên nên có thể mất vài giây; các lần sau nhanh.

Dừng: nhấn `Ctrl+C` trong cửa sổ đang chạy `pnpm dev`.

### 4.2 Chế độ production (dùng cho kiểm thử tải hoặc demo mượt hơn)

```bash
pnpm build
```

```bash
pnpm start:all
```

`start:all` chạy web dạng nhiều tiến trình (mỗi nhân CPU một tiến trình, tối đa 4, đổi bằng biến `WEB_WORKERS`),
cùng worker và mock. Mỗi lần sửa mã nguồn phải `pnpm build` lại.

### 4.3 Nạp dữ liệu khi không chạy mock

Thường không cần, vì `pnpm dev` tự đồng bộ. Dùng khi chỉ muốn có dữ liệu trong DB:

```bash
pnpm db:seed
```

Khi mock đang chạy mà muốn đồng bộ ngay (không đợi chu kỳ 1 phút / 10 phút):

```bash
pnpm sync
```

### 4.4 Tắt hẳn

Dừng `pnpm dev` / `pnpm start:all` bằng `Ctrl+C`, rồi tắt MySQL và Mailpit (dữ liệu vẫn được giữ):

```bash
docker compose stop
```

## 5. Dữ liệu mẫu và tài khoản

### 5.1 Sản phẩm

Dữ liệu đến từ mock Main System và luôn giống nhau mỗi lần khởi động mock: 6 danh mục (Nam: Áo thun nam, Quần nam;
Nữ: Áo nữ, Váy đầm), 40 sản phẩm, 195 biến thể. Danh mục "Nam" có 20 sản phẩm.

Những sản phẩm hữu ích khi kiểm thử:

| Mã   | Tên                       | Biến thể đáng chú ý (tồn kho ban đầu)                                                              |
| ---- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| P001 | Áo thun nam cổ tròn basic | Hồng pastel: M = **1**, L = **0** (hết hàng), XL = 36; Đen: M = 38, L = 50, XL = 44; giá 329.000 ₫ |
| P007 | Áo thun thể thao nam      | **Hết hàng toàn bộ**                                                                               |
| P026 | Áo len nữ dệt kim         | **Hết hàng toàn bộ**                                                                               |

Tồn kho thay đổi khi đặt hàng (mock trừ kho, web đồng bộ lại sau ≤ 1 phút). Khởi động lại mock (tắt và chạy lại
`pnpm dev`) để tồn kho trở về như ban đầu.

### 5.2 Tài khoản thành viên

Không có tài khoản dựng sẵn: tự đăng ký ở `/dang-ky` với email bất kỳ (ví dụ `tester1@example.com`). Không cần xác
thực email. Mật khẩu từ 8 ký tự. Mọi email (xác nhận đơn, đặt lại mật khẩu) xem ở Mailpit.

### 5.3 Quy tắc nghiệp vụ cần biết khi kiểm thử

| Quy tắc                              | Giá trị                             |
| ------------------------------------ | ----------------------------------- |
| Số lượng mỗi dòng trong giỏ          | 1–10                                |
| Phí giao hàng                        | Tiêu chuẩn 30.000 ₫, Nhanh 50.000 ₫ |
| Tổng thanh toán khi nhận hàng (COD)  | Tiền hàng + phí giao                |
| Đăng nhập sai liên tiếp              | 5 lần → khóa 15 phút                |
| Link đặt lại mật khẩu                | Hiệu lực 30 phút, dùng một lần      |
| Thời gian đơn mới sang Main          | ≤ 10 giây                           |
| Tồn kho đổi ở Main hiển thị trên web | ≤ 1 phút                            |
| Mã đơn                               | `ABC-YYMMDD-XXXXX`                  |

## 6. Công cụ hỗ trợ kiểm thử

### 6.1 Trang demo của Main System — http://localhost:4100/sim

- Bảng **đơn Main đã nhận**: mã Main, mã đơn web, khách, COD, trạng thái, mã vận đơn, "Số lần nhận" (phải luôn là 1).
- Nút **Chuyển trạng thái**: RECEIVED → PICKING → SHIPPING → DELIVERED; mỗi lần bấm Main gọi webhook IF-05 về website.
  **Giao thất bại** (chỉ khi đang SHIPPING) và **Gửi lại** (gửi lại trạng thái hiện tại).
- Ô **Tồn kho**: nhập SKU và số lượng mới.
- **Giả lập sự cố**: "Lỗi 503", "Treo (timeout)", "Lỗi 2 lần gửi đơn" (chỉ làm hỏng việc gửi đơn), "Bình thường".

Trạng thái của mock (đơn, tồn kho, sự cố) chỉ nằm trong bộ nhớ, mất khi khởi động lại.

### 6.2 Hộp thư Mailpit — http://localhost:8025

Mọi email gửi tới bất kỳ địa chỉ nào đều vào đây. Email được gửi nền sau khi trang trả kết quả, nên có thể trễ 1–2 giây.

### 6.3 Gọi API trực tiếp

Lệnh tương đương trang /sim:

```bash
curl -X POST localhost:4100/sim/orders/<mainOrderId>/advance -H 'content-type: application/json' -d '{}'
```

```bash
curl -X POST localhost:4100/sim/stock -H 'content-type: application/json' -d '{"sku":"P001-DEN-M","qty":3}'
```

```bash
curl -X POST localhost:4100/sim/fail-mode -H 'content-type: application/json' -d '{"mode":"error","count":2,"only":"/main/orders"}'
```

API của website trả lỗi dạng `{ "error": { "code", "message" } }` với thông báo tiếng Việt, ví dụ:

```bash
curl "localhost:3000/api/products?q=ao%20thun&size=M&sort=price_asc"
```

### 6.4 Xem dữ liệu trong DB

Nhật ký mọi lần trao đổi với Main System (bảng `sync_log`):

```bash
docker exec -it abcwear-mysql mysql -uroot -proot --default-character-set=utf8mb4 selling -e "SELECT createdAt, iface, direction, result, recordKey, message FROM sync_log ORDER BY createdAt DESC LIMIT 15"
```

Trạng thái các đơn gần nhất và hàng đợi gửi Main:

```bash
docker exec -it abcwear-mysql mysql -uroot -proot --default-character-set=utf8mb4 selling -e "SELECT code, status, mainOrderId, sendAttempts, nextSendAt, trackingNumber FROM orders ORDER BY createdAt DESC LIMIT 10"
```

## 7. Kiểm thử thủ công theo chức năng

Chạy hệ thống ở chế độ dev (mục 4.1). Mở sẵn ba tab: website, /sim, Mailpit. Mỗi ca ghi Đạt/Không đạt.
Cột "Mã" là mã use case trong đặc tả.

### 7.1 Tìm kiếm và duyệt sản phẩm

| #     | Mã    | Bước                                                                 | Kết quả mong đợi                                                                        |
| ----- | ----- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| TC-01 | PS-01 | Gõ `ao thun` (không dấu) vào ô tìm kiếm, nhấn Tìm                    | Chỉ ra các sản phẩm tên "Áo thun …"; URL có `?q=ao+thun`                                |
| TC-02 | PS-01 | Tìm `dam`                                                            | Ra các sản phẩm "Đầm …"                                                                 |
| TC-03 | PS-01 | Tìm `khongcosanphamnay`                                              | "Không tìm thấy sản phẩm phù hợp." kèm gợi ý                                            |
| TC-04 | PS-02 | Ở danh mục Nam: tick size M, giá từ 200000 đến 350000, bấm "Áp dụng" | Chỉ còn sản phẩm có ít nhất một biến thể size M trong khoảng giá; số lượng kết quả giảm |
| TC-05 | PS-02 | Tiếp TC-04, chọn "Sắp xếp: Giá tăng dần", rồi "Giá giảm dần"         | Giá trên thẻ sản phẩm tăng dần / giảm dần; bộ lọc vẫn giữ                               |
| TC-06 | PS-02 | Nhập giá từ 500000 đến 100000, Áp dụng                               | Không lỗi trang; giá "đến" không hợp lệ bị bỏ qua, chỉ lọc theo giá "từ"                |
| TC-07 | PS-03 | Bấm "Nam" trên menu                                                  | "20 sản phẩm", có cả "Áo thun …" lẫn "Quần …"                                           |
| TC-08 | PS-03 | Bấm "Quần nam"                                                       | Chỉ còn quần; số lượng nhỏ hơn TC-07                                                    |
| TC-09 | PS-04 | Mở P001 "Áo thun nam cổ tròn basic", chọn Hồng pastel → size L       | Huy hiệu "Tạm hết hàng"; nút "Thêm vào giỏ" bị khóa; size L gạch ngang                  |
| TC-10 | PS-04 | Chọn Hồng pastel → size M                                            | "Chỉ còn 1 sản phẩm"; nút "Thêm vào giỏ" bật                                            |
| TC-11 | PS-04 | Mở http://localhost:3000/san-pham/P007                               | Nút "Thêm vào giỏ" bị khóa, "Tạm hết hàng"                                              |
| TC-12 | —     | Mở http://localhost:3000/san-pham/KHONG-CO                           | Trang "Không tìm thấy trang" (HTTP 404)                                                 |

### 7.2 Giỏ hàng

| #     | Mã    | Bước                                                      | Kết quả mong đợi                                                            |
| ----- | ----- | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| TC-13 | OD-01 | Ở P001, chọn Đen / M, Số lượng 2, "Thêm vào giỏ"          | "Đã thêm 2 sản phẩm vào giỏ hàng."; header "Giỏ hàng (2)"                   |
| TC-14 | OD-01 | Ở P001, chọn Hồng pastel / M, Số lượng 2, "Thêm vào giỏ"  | "Sản phẩm này chỉ còn 1. Vui lòng giảm số lượng."; giỏ không đổi            |
| TC-15 | OD-01 | Thêm 10 sản phẩm Đen / L, rồi thêm 1 nữa                  | Lần sau báo "Mỗi sản phẩm tối đa 10 trong một đơn hàng. Giỏ hàng đã có 10." |
| TC-16 | OD-01 | Vào "Giỏ hàng", đổi số lượng một dòng, bấm "Xóa" một dòng | Thành tiền và tạm tính cập nhật ngay; số trên header đổi theo               |
| TC-17 | OD-01 | Xóa hết                                                   | "Giỏ hàng đang trống." và nút "Tiếp tục mua sắm"                            |

### 7.3 Đặt hàng (khách vãng lai)

| #     | Mã    | Bước                                                                       | Kết quả mong đợi                                                                                |
| ----- | ----- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| TC-18 | OD-02 | Có hàng trong giỏ → "Tiến hành đặt hàng" → để trống bước 1, bấm "Tiếp tục" | Báo lỗi từng trường bằng tiếng Việt ("Vui lòng nhập họ tên", "Vui lòng nhập tỉnh/thành phố", …) |
| TC-19 | OD-02 | Nhập SĐT `12345`                                                           | "Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0)"                                            |
| TC-20 | OD-03 | Điền đúng bước 1 → bước 2 chọn "Nhanh"                                     | Phí giao 50.000 ₫; Tổng COD = tiền hàng + 50.000 ₫ (Tiêu chuẩn: + 30.000 ₫)                     |
| TC-21 | OD-02 | Bước 3 kiểm lại sản phẩm, địa chỉ → "Đặt hàng"                             | Trang "Đặt hàng thành công" có mã `ABC-…` và số tiền COD; header "Giỏ hàng (0)"                 |
| TC-22 | OD-04 | Mở Mailpit                                                                 | Email "Xác nhận đơn hàng ABC-…" có mã đơn, từng sản phẩm, tổng COD, link tra cứu                |
| TC-23 | IN-02 | Trong ≤ 10 giây mở /sim                                                    | Đơn xuất hiện, trạng thái `RECEIVED`, "Số lần nhận" = 1                                         |
| TC-24 | OD-04 | Copy link trang hoàn tất, mở ở cửa sổ ẩn danh                              | "Không tìm thấy đơn" — chỉ người vừa đặt hoặc chủ tài khoản mới xem được                        |
| TC-25 | OD-02 | Mở `/dat-hang` khi giỏ trống                                               | "Giỏ hàng đang trống…" và nút quay về mua sắm                                                   |

### 7.4 Theo dõi đơn

| #     | Mã    | Bước                                                    | Kết quả mong đợi                                                                                   |
| ----- | ----- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| TC-26 | OD-05 | "Tra cứu đơn": nhập mã đơn TC-21 và email đã dùng       | Trạng thái "Đã chuyển kho" (hoặc "Đã xác nhận" nếu worker chưa kịp gửi), dòng thời gian, hàng, COD |
| TC-27 | OD-05 | Nhập đúng mã, sai email                                 | "Không tìm thấy đơn. Vui lòng kiểm tra lại mã đơn và email đã dùng khi đặt hàng."                  |
| TC-28 | IN-02 | Ở /sim bấm "Chuyển trạng thái" (→ PICKING), tra cứu lại | "Đang chuẩn bị hàng"                                                                               |
| TC-29 | IN-02 | Bấm tiếp (→ SHIPPING), tra cứu lại; mở Mailpit          | "Đang giao hàng" + mã vận đơn; email "Đơn hàng … đang được giao" có mã vận đơn và số tiền COD      |
| TC-30 | IN-02 | Bấm tiếp (→ DELIVERED); mở Mailpit                      | "Đã giao hàng"; email "… đã giao thành công"                                                       |
| TC-31 | IN-02 | Với một đơn khác đang SHIPPING, bấm "Giao thất bại"     | Tra cứu thấy "Giao không thành công", bước cuối đánh dấu đỏ                                        |
| TC-32 | OD-05 | Bấm link "Tra cứu đơn hàng" trong email                 | Ô mã đơn đã được điền sẵn                                                                          |

### 7.5 Thành viên

| #     | Mã    | Bước                                                                                     | Kết quả mong đợi                                                                                 |
| ----- | ----- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| TC-33 | MA-01 | "Đăng nhập" → "Tạo tài khoản mới", nhập họ tên, email mới, mật khẩu ≥ 8 ký tự            | Vào thẳng "Tài khoản của tôi"; header hiện tên và nút "Đăng xuất"                                |
| TC-34 | MA-01 | Đăng xuất, đăng ký lại cùng email (viết hoa khác đi)                                     | "Email này đã được đăng ký. Vui lòng đăng nhập hoặc dùng email khác."                            |
| TC-35 | MA-01 | Đăng ký với email `abc`, mật khẩu `123`                                                  | "Email không hợp lệ", "Mật khẩu cần ít nhất 8 ký tự"                                             |
| TC-36 | MA-02 | Đang đăng xuất, mở http://localhost:3000/tai-khoan                                       | Chuyển sang `/dang-nhap?next=…`; đăng nhập xong quay lại trang tài khoản                         |
| TC-37 | MA-02 | Khách vãng lai thêm 1 sản phẩm vào giỏ, rồi đăng nhập tài khoản đã có sản phẩm trong giỏ | Giỏ được gộp: số lượng cộng dồn (tối đa 10 mỗi dòng)                                             |
| TC-38 | MA-02 | Đăng nhập sai mật khẩu 5 lần liên tiếp                                                   | Lần 1–4: "Email hoặc mật khẩu không đúng…"; lần 5: "Tài khoản tạm khóa … 15 phút"                |
| TC-39 | MA-02 | Ngay sau TC-38, nhập **đúng** mật khẩu                                                   | Vẫn báo tài khoản tạm khóa                                                                       |
| TC-40 | MA-03 | "Quên mật khẩu?" → nhập email đã đăng ký                                                 | "Nếu email đã đăng ký, bạn sẽ nhận được liên kết…"; Mailpit có email "Đặt lại mật khẩu ABC Wear" |
| TC-41 | MA-03 | Mở link trong email, đặt mật khẩu mới, đăng nhập bằng mật khẩu mới                       | Thành công; tài khoản bị khóa ở TC-38 cũng được mở                                               |
| TC-42 | MA-03 | Mở lại đúng link đó lần nữa                                                              | "Liên kết không hợp lệ hoặc đã hết hạn…" (link chỉ dùng một lần)                                 |
| TC-43 | MA-03 | "Tài khoản" → "Đổi mật khẩu" với mật khẩu hiện tại sai; rồi đúng                         | Sai: "Mật khẩu hiện tại không đúng"; đúng: "Đã đổi mật khẩu."                                    |
| TC-44 | MA-04 | "Tài khoản": sửa họ tên, SĐT, địa chỉ mặc định → "Lưu thông tin" → tải lại trang         | "Đã lưu thông tin."; dữ liệu còn sau khi tải lại; header đổi tên                                 |
| TC-45 | MA-04 | Thêm sản phẩm vào giỏ → "Tiến hành đặt hàng"                                             | Bước 1 điền sẵn họ tên, SĐT, email, địa chỉ từ hồ sơ                                             |
| TC-46 | OD-02 | Đặt đơn ở TC-45, sau đó sửa địa chỉ trong hồ sơ, xem lại đơn                             | Đơn cũ vẫn giữ địa chỉ lúc đặt                                                                   |

### 7.6 Lịch sử đơn của thành viên

| #     | Mã    | Bước                                                                              | Kết quả mong đợi                                                                  |
| ----- | ----- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| TC-47 | OD-06 | Tài khoản A đặt 2 đơn → "Tài khoản" → "Đơn hàng của tôi"                          | Đủ 2 đơn, đơn mới nhất ở trên, có trạng thái và tổng tiền                         |
| TC-48 | OD-06 | Bấm vào một đơn                                                                   | Trang chi tiết: dòng thời gian trạng thái, sản phẩm, địa chỉ, mã vận đơn (nếu có) |
| TC-49 | OD-06 | Đăng nhập tài khoản B (trình duyệt khác), mở `/tai-khoan/don-hang/<mã đơn của A>` | "Không tìm thấy đơn" (HTTP 404)                                                   |
| TC-50 | OD-06 | Tài khoản chưa có đơn mở "Đơn hàng của tôi"                                       | "Bạn chưa có đơn hàng nào."                                                       |

### 7.7 Tích hợp Main System và sự cố

| #     | Mã    | Bước                                                                                                  | Kết quả mong đợi                                                                                        |
| ----- | ----- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| TC-51 | IN-01 | Ở /sim đổi tồn kho `P001-DEN-M` thành 3; đợi tối đa 1 phút; tải lại trang P001, chọn Đen / M          | "Chỉ còn 3 sản phẩm"                                                                                    |
| TC-52 | IN-02 | Ở /sim bấm "Lỗi 2 lần gửi đơn", đặt một đơn mới, theo dõi /sim                                        | Đơn chưa xuất hiện ngay; xuất hiện sau khoảng 30–40 giây (thử lại sau 10 s rồi 20 s); "Số lần nhận" = 1 |
| TC-53 | IN-02 | Bấm "Treo (timeout)", thử đặt hàng; sau đó bấm "Bình thường"                                          | Sau khoảng 3 giây báo "Hệ thống đang bận, chưa thể đặt hàng…"; không tạo đơn; giỏ giữ nguyên            |
| TC-54 | IN-02 | Ở /sim đặt tồn kho một SKU thành 0 **trong khi** giỏ đang có SKU đó, rồi đặt hàng ngay (trước 1 phút) | Báo "Không đủ hàng: … chỉ còn 0…"; không tạo đơn                                                        |
| TC-55 | IN-02 | Sau TC-52, xem `sync_log` (mục 6.4)                                                                   | Có dòng IF-04 `ERROR`, `RETRY` rồi `OK` cho mã đơn đó                                                   |

### 7.8 Phi chức năng

| #     | Mã    | Bước                                                                                         | Kết quả mong đợi                                                                                 |
| ----- | ----- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| TC-56 | NF-04 | Mở DevTools (F12) → chế độ thiết bị, chiều rộng 375 px; duyệt các trang chính và đặt một đơn | Không có thanh cuộn ngang; menu danh mục thu vào nút "☰ Danh mục"                               |
| TC-57 | NF-02 | Mở http://localhost:3000/api/healthz; tắt MySQL (`docker compose stop mysql`), mở lại        | Lúc đầu 200 `"db":"ok"`; khi tắt MySQL: 503 `"db":"down"`. Bật lại: `docker compose start mysql` |
| TC-58 | NF-01 | Mở các trang chính khi hệ thống không chịu tải                                               | Mỗi trang hiển thị dưới 2 giây (trừ lần biên dịch đầu ở chế độ dev)                              |

## 8. Kiểm thử tự động

Tất cả lệnh chạy ở thư mục gốc dự án. Docker (MySQL, Mailpit) phải đang chạy.

### 8.1 Kiểm tra mã nguồn

```bash
pnpm lint
```

```bash
pnpm typecheck
```

Đạt khi cả hai kết thúc không báo lỗi.

### 8.2 Unit và integration (Vitest)

```bash
pnpm test
```

- **Unit** (`tests/unit/`): hàm thuần, mock Main, client tích hợp, băm mật khẩu.
- **Integration** (`tests/integration/`): module thật + MySQL + mock Main thật. Chạy trên DB riêng `selling_test`
  (tự tạo và migrate), **không đụng** dữ liệu `selling`.
- Không cần chạy `pnpm dev`. Thời gian khoảng 30–60 giây.
- Kết quả hiện tại: `Test Files 19 passed`, `Tests 146 passed`.

Chỉ chạy unit (không cần MySQL):

```bash
pnpm vitest run --project unit
```

Chạy một file:

```bash
pnpm vitest run tests/integration/order.test.ts
```

### 8.3 E2E (Playwright, trình duyệt thật)

```bash
pnpm test:e2e
```

- Nếu đã có server ở cổng 3000, Playwright dùng lại; nếu chưa, tự chạy `pnpm dev`. Đảm bảo server ở cổng 3000 là của
  chính dự án này.
- Hai bước chuẩn bị chạy trước: đồng bộ dữ liệu từ mock (`pnpm sync`) và mở trước mọi trang để dev server biên dịch sẵn.
- 27 ca kiểm thử + 2 bước chuẩn bị, phủ mọi use case (tìm kiếm, thành viên, giỏ, đặt hàng, tra cứu, tích hợp) và khổ
  375 px. Email được đọc thật từ Mailpit. Thời gian khoảng 2–6 phút.
- E2E chạy trên DB `selling` và tạo tài khoản/đơn thật (email đuôi `@e2e.abcwear.test`); tồn kho của mock giảm theo.
- Mặc định dùng Google Chrome có sẵn. Dùng Edge:

```bash
PW_CHANNEL=msedge pnpm test:e2e
```

Chạy một file, hoặc lọc theo tên ca:

```bash
pnpm test:e2e tests/e2e/order.spec.ts
```

```bash
pnpm test:e2e -g "PS-04"
```

Xem báo cáo HTML (có ảnh, trace của ca lỗi):

```bash
pnpm exec playwright show-report
```

| File                           | Nội dung                                                                 |
| ------------------------------ | ------------------------------------------------------------------------ |
| `tests/e2e/catalog.spec.ts`    | PS-01 → PS-04, trang 404                                                 |
| `tests/e2e/member.spec.ts`     | MA-01 → MA-04, khóa tài khoản, đặt lại mật khẩu qua email                |
| `tests/e2e/order.spec.ts`      | OD-01 → OD-04, gộp giỏ, đơn sang Main ≤ 10 giây                          |
| `tests/e2e/tracking.spec.ts`   | OD-05, OD-06, IN-01 (tồn kho ≤ 1 phút), IN-02 (thử lại, không trùng đơn) |
| `tests/e2e/responsive.spec.ts` | Mọi trang ở khổ 375 px                                                   |

### 8.4 Thứ tự khuyến nghị trước khi bàn giao

1. `pnpm lint` và `pnpm typecheck`
2. `pnpm test`
3. `pnpm test:e2e`
4. Kiểm thử thủ công nhanh: TC-01, TC-09, TC-21 → TC-23, TC-28 → TC-30, TC-33, TC-47
5. (Tùy chọn) Kiểm thử tải — mục 9

## 9. Kiểm thử tải (k6)

Đo yêu cầu "phản hồi < 2 giây" (NF-01): 100 người dùng ảo trong 2 phút, tỉ lệ tìm kiếm 40%, xem chi tiết 30%,
đăng nhập 20%, đặt hàng 10%. Ngưỡng đạt: mọi request < 2 giây, lỗi < 1%. k6 chạy bằng Docker image `grafana/k6`
(lần đầu Docker tự tải image).

**Bước 1 — Build và chạy bản production** (không đo trên `pnpm dev`, vì dev biên dịch trang theo yêu cầu):

```bash
pnpm build
```

```bash
pnpm start:all
```

Đợi log `[worker] IF-02 stock: ...` rồi mới chạy bước 2.

**Bước 2 — Chạy k6** ở một cửa sổ terminal khác (khoảng 2 phút 40 giây):

```bash
pnpm test:load
```

Trên Linux, nếu `host.docker.internal` không phân giải được:

```bash
docker run --rm -i --add-host=host.docker.internal:host-gateway -e BASE_URL=http://host.docker.internal:3000 grafana/k6:1.0.0 run - < tests/load/k6.js
```

**Đọc kết quả** — phần `THRESHOLDS` ở cuối:

- `http_req_failed ✓ 'rate<0.01'` — tỉ lệ lỗi đạt.
- `http_req_duration ✓ 'max<2000'` — mọi request dưới 2 giây; `✗ … max=…` là chưa đạt. Xem thêm `p(95)`, `p(99)` ở phần
  `HTTP` để biết phần lớn request nhanh đến đâu.
- Chưa đạt ngưỡng thì lệnh kết thúc với mã lỗi 99 — đó là kết quả đo, không phải lỗi chạy.

**Lưu ý**

- Kết quả phụ thuộc máy đo. Kết quả đã ghi nhận trên laptop i5 4 nhân (mọi thành phần kể cả k6 chạy cùng máy): 0% lỗi,
  p99 1,90 s, chậm nhất 3,75 s — chi tiết và phân tích ở [tests/load/result.md](../tests/load/result.md).
- Để đo chính xác hơn: cắm sạc, chọn chế độ hiệu năng cao của Windows, đóng các ứng dụng nặng; tốt nhất chạy k6 từ một
  máy khác (đặt `BASE_URL` là địa chỉ máy chạy web).
- k6 tạo 20 tài khoản (email `@load.abcwear.test`) và vài trăm đơn trong DB `selling`, kèm email trong Mailpit.
- Phân tích truy vấn sản phẩm bằng `EXPLAIN` trên 20.000 sản phẩm: [tests/load/explain.md](../tests/load/explain.md).

## 10. Xử lý sự cố

| Hiện tượng                                                                     | Nguyên nhân                                  | Cách xử lý                                                                     |
| ------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------ |
| `Can't reach database server at localhost:3306`                                | MySQL chưa chạy                              | Mở Docker Desktop, chạy `docker compose up -d --wait`                          |
| Tiến trình dừng ngay với `Invalid environment configuration` và danh sách biến | Thiếu hoặc sai `.env`                        | `cp .env.example .env`, sửa biến được liệt kê                                  |
| `@prisma/client did not initialize yet`                                        | Chưa sinh Prisma Client                      | `pnpm exec prisma generate` (bình thường `pnpm install` tự làm)                |
| `Package import specifier "#main-entry-point" is not defined` (Windows)        | Đường dẫn thư mục dự án quá dài              | Chuyển dự án sang thư mục ngắn (ví dụ `D:\code\abc-wear`), cài lại             |
| `EADDRINUSE` / cổng 3000 hoặc 4100 đang bị dùng                                | Còn tiến trình cũ hoặc ứng dụng khác         | Tắt tiến trình cũ; trên Windows tìm bằng `netstat -ano \| findstr :3000`       |
| Trang có sản phẩm nhưng **không có ảnh**                                       | Ảnh do mock phục vụ, mock không chạy         | Chạy `pnpm dev` (gồm mock)                                                     |
| Trang chủ trống "Chưa có sản phẩm"                                             | Worker chưa đồng bộ                          | Đợi 15–20 giây, hoặc chạy `pnpm sync` khi mock đang chạy                       |
| `[worker] IF-01 catalog failed: … ECONNREFUSED` một lần lúc khởi động          | Worker lên trước mock                        | Bình thường, worker tự thử lại sau 15 giây                                     |
| Không thấy email trong Mailpit                                                 | Mailpit chưa chạy, hoặc email đang gửi nền   | `docker compose ps`; đợi 1–2 giây; xem log web có `[email] failed`             |
| Đặt hàng báo "Hệ thống đang bận…"                                              | Mock tắt, hoặc đang bật giả lập sự cố        | Ở /sim bấm "Bình thường"; kiểm tra mock đang chạy                              |
| Đơn không sang /sim                                                            | Worker không chạy, hoặc đang giả lập lỗi     | Xem log `[worker]`, bảng `orders` (`sendAttempts`, `nextSendAt`) và `sync_log` |
| Tài khoản bị khóa khi đang thử                                                 | Sai mật khẩu 5 lần                           | Đợi 15 phút hoặc dùng "Quên mật khẩu?" (đặt lại xong là mở khóa)               |
| Trang hoàn tất đơn báo "Không tìm thấy đơn"                                    | Mở ở trình duyệt khác với trình duyệt đã đặt | Đúng thiết kế; dùng "Tra cứu đơn" với mã đơn + email                           |
| E2E báo không tìm thấy Chrome                                                  | Máy không có Chrome                          | `PW_CHANNEL=msedge pnpm test:e2e`                                              |
| E2E lỗi vì thiếu hàng sau nhiều lần chạy                                       | Tồn kho của mock giảm sau mỗi đơn            | Khởi động lại `pnpm dev` (mock trả tồn kho về ban đầu), đợi 1 phút             |
| k6 dừng ở `setup` với `only N SKUs with stock >= 15; restart the mock`         | Tồn kho mock đã cạn sau nhiều lần đo         | Khởi động lại `pnpm start:all`                                                 |
| `pnpm test` lỗi `Could not migrate the test database`                          | MySQL chưa chạy                              | `docker compose up -d --wait`                                                  |

## 11. Đặt lại dữ liệu và dọn dẹp

| Muốn                                          | Làm                                                               |
| --------------------------------------------- | ----------------------------------------------------------------- |
| Trả tồn kho, đơn và sự cố của mock về ban đầu | Tắt và chạy lại `pnpm dev` (trạng thái mock chỉ nằm trong bộ nhớ) |
| Xóa hết email trong Mailpit                   | Nút xóa trong giao diện http://localhost:8025                     |
| Xóa toàn bộ dữ liệu web (tài khoản, đơn, giỏ) | Xem cảnh báo bên dưới                                             |

**Xóa toàn bộ dữ liệu — không hoàn tác được.** Lệnh sau xóa cả volume MySQL (mọi DB: `selling`, `selling_test`) và
dữ liệu Mailpit, sau đó dựng lại từ đầu:

```bash
docker compose down -v
```

```bash
docker compose up -d --wait
```

```bash
pnpm db:deploy
```

Sau đó chạy `pnpm dev` để nạp lại sản phẩm.

---

Tài liệu liên quan: [README.md](../README.md) (tổng quan, lệnh, triển khai nhiều instance, bảng truy vết) ·
[DECISIONS.md](../DECISIONS.md) (quyết định kỹ thuật) · [PROGRESS.md](../PROGRESS.md) (tiến độ) ·
[tests/load/result.md](../tests/load/result.md) (kết quả kiểm thử tải).
