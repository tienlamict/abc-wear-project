# Kịch bản demo — Web Site Selling System (ABC Wear)

Kịch bản trình diễn hệ thống trong khoảng **20 phút** (phần chính) + **5–10 phút** phần mở rộng và hỏi đáp.
Đối tượng: khách hàng ABC Wear, giảng viên hoặc hội đồng đánh giá. Mỗi bước ghi rõ **làm gì**, **nói gì** và
**chỉ cho người xem thấy gì**, kèm mã use case để truy vết.

Cài đặt và chạy hệ thống: [README.md](../README.md). Kiểm thử chi tiết: [huong_dan_su_dung.md](huong_dan_su_dung.md).

**Mục lục**

1. [Thông điệp chính](#1-thông-điệp-chính)
2. [Chuẩn bị trước buổi demo](#2-chuẩn-bị-trước-buổi-demo)
3. [Bố trí màn hình](#3-bố-trí-màn-hình)
4. [Kịch bản chính (20 phút)](#4-kịch-bản-chính-20-phút)
5. [Phần mở rộng (khi còn thời gian hoặc được hỏi)](#5-phần-mở-rộng-khi-còn-thời-gian-hoặc-được-hỏi)
6. [Câu hỏi thường gặp](#6-câu-hỏi-thường-gặp)
7. [Xử lý sự cố trong lúc demo](#7-xử-lý-sự-cố-trong-lúc-demo)
8. [Sau buổi demo](#8-sau-buổi-demo)

---

## 1. Thông điệp chính

Người xem cần nhớ được ba điều sau buổi demo:

1. **Website bán hàng đầy đủ chức năng RFP yêu cầu**: tìm kiếm, xem sản phẩm, giỏ hàng, đặt hàng 3 bước không cần tài
   khoản, thanh toán khi nhận hàng (COD), thành viên, theo dõi đơn.
2. **Main System là nguồn dữ liệu duy nhất**: sản phẩm, giá, tồn kho, ảnh được quản lý ở Main; website chỉ nhận lại qua
   đồng bộ và gửi đơn sang Main. Website không có trang quản trị.
3. **Ba nguyên tắc của RFP có bằng chứng**: dễ dùng (đặt hàng 3 bước, giao diện điện thoại), 24/365 (không giữ trạng
   thái trong bộ nhớ, gửi đơn có thử lại, health check), phản hồi nhanh (kết quả k6).

## 2. Chuẩn bị trước buổi demo

Làm trước ít nhất **30 phút** để có thời gian xử lý nếu có trục trặc.

### 2.1 Khởi động hệ thống

```bash
docker compose up -d --wait
```

```bash
pnpm dev
```

Đợi log `[worker] IF-02 stock: ...` (khoảng 20 giây). Lần đầu chạy, mock tự tạo 80 ảnh seed trên MinIO.

### 2.2 Đưa dữ liệu về trạng thái sạch

Sau nhiều lần chạy thử, tồn kho đã giảm và có thể còn sản phẩm thử nghiệm. Đưa danh mục và tồn kho của Main về seed:

```bash
curl -X POST localhost:4100/sim/reset
```

```bash
pnpm sync
```

Xóa email cũ trong Mailpit (nút xóa ở http://localhost:8025) để hộp thư chỉ còn email của buổi demo.

### 2.3 Kiểm tra nhanh (checklist)

| Kiểm tra                                                     | Mong đợi                                            |
| ------------------------------------------------------------ | --------------------------------------------------- |
| http://localhost:3000                                        | Banner, danh mục Nam/Nữ, 8 sản phẩm mới **có ảnh**  |
| http://localhost:3000/api/healthz                            | `{"status":"ok","db":"ok",...}`                     |
| http://localhost:4100/admin (`admin` / `change-me`)          | Danh sách 40 sản phẩm, khung "Đồng bộ sang website" |
| http://localhost:4100/sim                                    | Trang Mock Main System, giả lập sự cố đang "none"   |
| http://localhost:3000/san-pham/P000001, chọn Hồng pastel / L | "Tạm hết hàng" (nếu không, đã quên bước 2.2)        |
| http://localhost:8025                                        | Hộp thư trống                                       |

Mở trước mỗi trang ở trên một lần: ở chế độ dev, trang biên dịch ở lần mở đầu tiên nên có thể chậm vài giây.

### 2.4 Chuẩn bị tài nguyên

- **Ảnh sản phẩm để tải lên ở bước 4.2**: 2 ảnh JPG hoặc PNG đẹp (ảnh thật của một chiếc áo sơ mi nữ màu trắng là phù
  hợp nhất), mỗi ảnh ≤ 5 MB, cạnh ngắn ≥ 400 px. Để sẵn trong một thư mục dễ kéo-thả. Nếu không có, dùng
  `tests/fixtures/sample.jpg` và `tests/fixtures/sample.png`.
- **Ảnh lỗi để minh họa từ chối**: `tests/fixtures/fake-image.jpg` (thực chất là file PDF).
- **Email cho khách vãng lai**: `lan.nguyen@example.com`. **Email cho thành viên**: `minh.tran@example.com`, mật khẩu
  `DemoABC2026`. Đổi sang email khác nếu đã dùng ở lần demo trước (email thành viên không đăng ký lại được).
- **Thông tin giao hàng**: Nguyễn Thị Lan, 0987 654 321, 25 Trần Hưng Đạo, Phường Phạm Ngũ Lão, Quận 1, TP. Hồ Chí Minh.

### 2.5 Trình duyệt

- Dùng cửa sổ **ẩn danh** cho website (giỏ hàng và đăng nhập sạch), cửa sổ thường cho `/admin` và `/sim`.
- Phóng to 110–125% (Ctrl +) để người xem ở xa đọc được.
- Tắt thông báo hệ điều hành, đóng ứng dụng không liên quan.

## 3. Bố trí màn hình

Mở sẵn các tab theo thứ tự, chuyển tab bằng Ctrl+1…Ctrl+5:

| Tab | Địa chỉ                     | Vai trò trong demo                               |
| --- | --------------------------- | ------------------------------------------------ |
| 1   | http://localhost:3000       | Website (cửa sổ ẩn danh) — góc nhìn khách hàng   |
| 2   | http://localhost:4100/admin | Main System — quản lý sản phẩm, ảnh, tồn kho     |
| 3   | http://localhost:4100/sim   | Main System — đơn đã nhận, giao hàng, sự cố      |
| 4   | http://localhost:8025       | Hộp thư của khách (Mailpit)                      |
| 5   | http://localhost:9001       | Console MinIO (`minioadmin` / `change-me-12345`) |

Nếu có hai màn hình: màn hình chiếu để website, màn hình còn lại để `/admin` và `/sim`, chỉ kéo sang khi cần.

## 4. Kịch bản chính (20 phút)

| Phần | Nội dung                                 | Use case             | Thời gian |
| ---- | ---------------------------------------- | -------------------- | --------- |
| 4.1  | Giới thiệu kiến trúc                     | —                    | 1 phút    |
| 4.2  | Main System nhập sản phẩm, ảnh → website | AD-01 → AD-05, IN-01 | 5 phút    |
| 4.3  | Khách tìm và xem sản phẩm                | PS-01 → PS-04        | 3 phút    |
| 4.4  | Giỏ hàng và đặt hàng vãng lai            | OD-01 → OD-04, IF-03 | 4 phút    |
| 4.5  | Đơn sang Main, Main giao hàng            | IN-02 (IF-04, IF-05) | 2 phút    |
| 4.6  | Khách tra cứu đơn                        | OD-05                | 1 phút    |
| 4.7  | Thành viên và lịch sử đơn                | MA-01, MA-04, OD-06  | 3 phút    |
| 4.8  | Kết: bằng chứng phi chức năng            | NF-01, NF-02, NF-04  | 1 phút    |

### 4.1 Giới thiệu kiến trúc (1 phút)

**Làm:** mở README, cuộn tới sơ đồ, hoặc vẽ nhanh lên bảng:

```
Khách hàng ─► Website (Next.js) ─► Selling DB (MySQL)
                   ▲     │
          đồng bộ  │     │ gửi đơn, kiểm tồn kho
                   │     ▼
              Main System ◄── quản trị viên ABC Wear (/admin)
                   │
                   └─► MinIO (ảnh sản phẩm) ──► trình duyệt khách tải ảnh
```

**Nói:**

> "Hệ thống gồm website bán hàng và Main System của ABC Wear. Main giữ sản phẩm, giá, tồn kho và điều phối giao hàng;
> website nhận dữ liệu qua đồng bộ và chuyển đơn sang Main. Vì Main System thật chưa chốt giao diện, nhóm dựng một bản
> mock có cùng giao diện tích hợp — module `integration` của website là chỗ duy nhất gọi Main, nên thay bằng Main thật
> chỉ cần sửa một module."

### 4.2 Main System nhập sản phẩm và ảnh → website tự cập nhật (5 phút)

**Bước 1 — Danh sách sản phẩm (AD-01).** Tab 2 (`/admin`).

- Gõ `ao thun` (không dấu) vào ô tìm → danh sách lọc ngay. Chọn danh mục "— Váy đầm" → chỉ còn váy. Xóa bộ lọc.
- **Nói:** "Đây là phía Main System, không phải website. Trang được bảo vệ bằng tài khoản, website không có trang
  quản trị nào — đúng yêu cầu RFP là chức năng quản trị nội bộ nằm ngoài phạm vi website."

**Bước 2 — Thêm sản phẩm (AD-02).** Bấm "Thêm sản phẩm".

| Trường          | Nhập                                              |
| --------------- | ------------------------------------------------- |
| Tên sản phẩm    | `Áo sơ mi lụa nữ tay dài`                         |
| Danh mục        | Áo nữ                                             |
| Mô tả           | `Lụa mềm, thoáng mát, phù hợp đi làm và dạo phố.` |
| Biến thể dòng 1 | Size `M`, màu `Trắng`, giá `459000`, tồn `15`     |
| Biến thể dòng 2 | Size `L`, màu `Trắng`, giá `459000`, tồn `10`     |

Bấm "Lưu sản phẩm".

- **Chỉ cho người xem:** mã sản phẩm mới `P0000xx` do Main cấp; SKU tự gợi ý `P0000xx-M-TRANG`; dòng xanh "Đã đồng bộ
  sang website: 41 sản phẩm… (xxx ms)".
- **Nói:** "Lưu xong, Main gọi webhook báo website đồng bộ ngay — không phải chờ chu kỳ 10 phút."

**Bước 3 — Tải ảnh (AD-03).** Kéo-thả 2 ảnh đã chuẩn bị vào khu ảnh.

- **Chỉ cho người xem:** thanh tiến trình; kết quả từng file "Đã tải lên (… × …, WebP)"; nhãn "Ảnh đại diện" ở ảnh đầu.
- Kéo-thả thêm `tests/fixtures/fake-image.jpg` → báo "Không đọc được file ảnh. Chỉ nhận ảnh JPEG, PNG hoặc WebP."
- **Nói:** "Main kiểm định dạng theo nội dung file chứ không tin đuôi file — đây là một file PDF đổi tên thành .jpg.
  Ảnh hợp lệ được xoay đúng chiều, thu nhỏ tối đa 1200 px, chuyển sang WebP rồi lưu lên MinIO."
- (Tùy chọn) Tab 5: mở bucket `product-images` → `products/P0000xx/` thấy các file `.webp` tên ngẫu nhiên.

**Bước 4 — Xem trên website.** Tab 1, gõ `so mi lua` vào ô tìm kiếm.

- **Chỉ cho người xem:** sản phẩm vừa tạo đã có, kèm ảnh đại diện và giá 459.000 ₫. Mở chi tiết: ảnh lớn + dải ảnh
  nhỏ, bấm ảnh nhỏ để đổi.
- **Nói:** "Từ lúc bấm Lưu ở Main tới lúc khách thấy sản phẩm chỉ khoảng một giây."

**Bước 5 — Đổi thứ tự ảnh, tồn kho, ngừng bán (AD-03, AD-04).** Quay lại tab 2.

- Bấm ↑ ở ảnh 2 → ảnh 2 thành "Ảnh đại diện". Trên website, tải lại trang tìm kiếm → thẻ sản phẩm đổi ảnh.
- Ở dòng biến thể `L`, sửa tồn kho thành `0` → "Lưu nhanh" (dòng trạng thái báo "Đã đồng bộ tồn kho…"). Trên website,
  chọn size L → "Tạm hết hàng", nút "Thêm vào giỏ" bị khóa.
- Giữ sản phẩm ở trạng thái **Đang bán** để dùng tiếp ở phần 4.4.

**Nói kết phần:** "Mọi thay đổi ở Main đều tự sang website. Nếu website tạm thời không nhận được, dữ liệu vẫn lưu ở
Main và lần đồng bộ định kỳ của worker sẽ bù lại — phần này demo ở mục 5.3 nếu có thời gian."

### 4.3 Khách tìm và xem sản phẩm (3 phút)

Tab 1, đóng vai khách hàng.

**Bước 1 — Tìm không dấu (PS-01).** Gõ `ao thun` → các sản phẩm "Áo thun …".

> "Khách gõ không dấu vẫn tìm ra, vì CSDL so sánh không phân biệt dấu."

**Bước 2 — Lọc và sắp xếp (PS-02).** Chọn size **M**, giá từ `200000` đến `350000` → "Áp dụng"; chọn "Sắp xếp: Giá
tăng dần".

- **Chỉ cho người xem:** URL chứa bộ lọc (`?q=ao+thun&size=M&…`) — chép URL gửi người khác là thấy đúng kết quả đó.

**Bước 3 — Duyệt danh mục (PS-03).** Bấm "Nam" trên menu → sản phẩm của cả "Áo thun nam" và "Quần nam"; bấm "Quần
nam" để thu hẹp.

**Bước 4 — Chi tiết, tồn kho theo biến thể (PS-04).** Mở "Áo thun nam cổ tròn basic" (`/san-pham/P000001`).

- Chọn **Hồng pastel / L** → "Tạm hết hàng", nút khóa. Chọn **Hồng pastel / M** → "Chỉ còn 1 sản phẩm".
- **Nói:** "Website hiển thị tồn kho theo từng size và màu, lấy từ Main mỗi phút."

### 4.4 Giỏ hàng và đặt hàng vãng lai (4 phút)

**Bước 1 — Thêm vào giỏ (OD-01).**

- Ở P000001, chọn **Hồng pastel / M**, số lượng **2** → "Thêm vào giỏ" → báo chỉ còn 1, không thêm được.
  > "Website chặn ngay khi số lượng vượt tồn kho."
- Chọn **Đen / L**, số lượng 2 → "Thêm vào giỏ". Số trên "Giỏ hàng" tăng.
- Mở sản phẩm áo sơ mi lụa tạo ở 4.2, chọn **M / Trắng**, số lượng 1 → "Thêm vào giỏ".

**Bước 2 — Giỏ hàng.** Bấm "Giỏ hàng": đổi số lượng một dòng, thấy tổng tiền cập nhật → "Tiến hành đặt hàng".

**Bước 3 — Đặt hàng 3 bước (OD-02 → OD-04).**

1. **Thông tin giao hàng**: nhập thông tin ở mục 2.4, email `lan.nguyen@example.com` → "Tiếp tục".
2. **Phương thức giao**: chọn "Nhanh" → chỉ cho người xem tổng COD = tiền hàng + 50.000 ₫ → "Tiếp tục".
3. **Xác nhận đơn**: kiểm tra lại → "Đặt hàng".

- **Chỉ cho người xem:** trang "Đặt hàng thành công" với mã đơn `ABC-YYMMDD-XXXXX` và số tiền thanh toán khi nhận hàng.
  **Ghi lại mã đơn** để dùng ở 4.5, 4.6.
- **Nói:** "Không cần tài khoản, ba bước. Ngay lúc bấm Đặt hàng, website hỏi Main còn đủ hàng không (IF-03) — nếu Main
  báo thiếu, đơn không được tạo. Bấm Đặt hàng hai lần cũng không tạo hai đơn."

**Bước 4 — Email xác nhận.** Tab 4 (Mailpit): email xác nhận đơn gồm từng sản phẩm, phí giao, tổng COD, địa chỉ và
link tra cứu.

### 4.5 Đơn sang Main, Main giao hàng (2 phút)

**Bước 1 — Đơn tự sang Main (IF-04).** Tab 3 (`/sim`), tải lại trang: đơn vừa đặt ở trạng thái `RECEIVED`, cột "Số lần
nhận" = 1.

> "Worker gửi đơn sang Main trong vòng vài giây. Nếu Main lỗi, worker thử lại với thời gian chờ tăng dần, và Main không
> bao giờ nhận trùng đơn."

**Bước 2 — Main chuyển trạng thái (IF-05).** Bấm "Chuyển trạng thái" hai lần: `PICKING` rồi `SHIPPING` (có mã vận đơn).

- Tab 4: khách nhận email "đang được giao" kèm mã vận đơn và số tiền cần chuẩn bị.
- **Nói:** "Main báo trạng thái về website qua webhook có khóa bí mật; website gửi email cho khách."

### 4.6 Khách tra cứu đơn (1 phút)

Tab 4, trong email bấm link tra cứu (mã đơn đã điền sẵn) → nhập email `lan.nguyen@example.com` → "Tra cứu".

- **Chỉ cho người xem:** trạng thái "Đang giao hàng", dòng thời gian các bước, mã vận đơn.
- Đổi email thành một email khác → "Không tìm thấy đơn…".
  > "Phải có đúng cả mã đơn và email, người lạ không xem được đơn của người khác."

### 4.7 Thành viên và lịch sử đơn (3 phút)

**Bước 1 — Đăng ký (MA-01).** "Đăng nhập" → "Tạo tài khoản mới" → họ tên `Trần Minh`, email
`minh.tran@example.com`, mật khẩu `DemoABC2026` → đăng ký. Được đăng nhập ngay, không cần xác thực email.

**Bước 2 — Hồ sơ (MA-04).** Vào "Tài khoản": nhập số điện thoại và địa chỉ mặc định → "Lưu thông tin".

**Bước 3 — Đặt hàng với thông tin điền sẵn.** Thêm một sản phẩm bất kỳ vào giỏ → "Tiến hành đặt hàng": thông tin giao
hàng đã điền sẵn từ hồ sơ → "Tiếp tục" → "Tiếp tục" → "Đặt hàng".

**Bước 4 — Lịch sử đơn (OD-06).** "Tài khoản" → "Đơn hàng của tôi": đơn mới nhất đứng đầu, bấm vào để xem chi tiết.

> "Thành viên chỉ thấy đơn của mình. Đơn của khách vãng lai ở phần trước không nằm trong danh sách này."

### 4.8 Kết: bằng chứng phi chức năng (1 phút)

- **Dễ dùng (NF-04):** bấm F12 → chế độ thiết bị 375 px → trang chủ, chi tiết, giỏ hàng hiển thị gọn, menu danh mục
  thu vào nút "☰ Danh mục".
- **24/365 (NF-02):** mở http://localhost:3000/api/healthz. "Website không giữ trạng thái trong bộ nhớ nên chạy nhiều
  instance sau load balancer được — README mục 'Chạy nhiều instance'."
- **Phản hồi < 2 giây (NF-01):** mở `tests/load/result.md`: 100 người dùng ảo trong 2 phút, 0% lỗi, 99% request dưới
  1,9 giây. Nói rõ: request chậm nhất 3,75 giây trên laptop chạy cả hệ thống lẫn công cụ đo, nên ngưỡng "mọi request
  dưới 2 giây" chưa đạt trên máy này — phân tích nằm trong file kết quả.
- **Kiểm thử tự động:** 110 unit, 62 integration, 32 E2E trên trình duyệt thật, phủ mọi use case (bảng truy vết ở README).

## 5. Phần mở rộng (khi còn thời gian hoặc được hỏi)

### 5.1 Main tạm thời lỗi — đơn vẫn sang đúng một lần (IN-02)

1. Tab 3 bấm **"Lỗi 2 lần gửi đơn"**.
2. Website: đặt một đơn vãng lai mới (đặt hàng vẫn thành công vì kiểm tồn kho không bị lỗi).
3. Tab 3, tải lại sau ~10 giây: chưa có đơn. Sau ~30–40 giây: đơn xuất hiện, "Số lần nhận" = 1.

> "Worker thử lại sau 10 giây rồi 20 giây, tối đa 10 lần; mọi lần gọi đều ghi nhật ký `sync_log`."

Biến thể: bấm **"Treo (timeout)"** rồi đặt hàng → sau ~3 giây website báo "Hệ thống đang bận, chưa thể đặt hàng…",
không tạo đơn, giỏ giữ nguyên. **Nhớ bấm "Bình thường"** để trả lại.

### 5.2 Đổi tồn kho trực tiếp ở Main (IN-01)

Tab 3, ô "Tồn kho": SKU `P000001-M-DEN`, số lượng `3` → "Cập nhật". Trong vòng 1 phút, trang P000001 chọn Đen / M hiện
"Chỉ còn 3 sản phẩm". (Khác với `/admin` — đường này không gọi webhook, để minh họa đồng bộ định kỳ mỗi phút.)

### 5.3 Website mất kết nối với Main (AD-05)

```bash
curl -X POST localhost:4100/sim/catalog-webhook -H 'content-type: application/json' -d '{"enabled":false}'
```

1. Tab 2, sản phẩm áo sơ mi lụa: đổi giá dòng M thành `489000` → "Lưu nhanh" → dòng vàng "Chưa đồng bộ được sang
   website…". Website vẫn hiện giá cũ.
2. Bật lại:

```bash
curl -X POST localhost:4100/sim/catalog-webhook -H 'content-type: application/json' -d '{"enabled":true}'
```

3. Ở danh sách `/admin` bấm "Đồng bộ ngay" → website hiện giá mới.

> "Thay đổi không bao giờ bị mất: dữ liệu nằm ở Main, website chỉ là bản sao được đồng bộ lại."

### 5.4 Ngừng bán, giá mới không ảnh hưởng đơn cũ (AD-04)

- Đổi giá dòng M của áo sơ mi lụa → tra cứu lại đơn ở 4.6: đơn vẫn giữ giá lúc đặt.
- Ở danh sách `/admin` bấm "Ngừng bán" → sản phẩm biến mất khỏi tìm kiếm trên website; mở trực tiếp trang chi tiết thì
  báo "Sản phẩm này tạm ngừng kinh doanh."

### 5.5 Khóa tài khoản và quên mật khẩu (MA-02, MA-03)

Đăng xuất, đăng nhập `minh.tran@example.com` sai mật khẩu 5 lần → tài khoản khóa 15 phút. "Quên mật khẩu?" → email đặt
lại trong Mailpit → đặt mật khẩu mới → tài khoản được mở khóa, đăng nhập lại được.

## 6. Câu hỏi thường gặp

| Câu hỏi                                   | Gợi ý trả lời                                                                                                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sao không có thanh toán trực tuyến?       | Phạm vi đã chốt: mọi đơn là COD. Thêm cổng thanh toán là giai đoạn sau, luồng đặt hàng đã tách bước để chèn thêm.                                               |
| Sao website không có trang quản trị?      | RFP xếp quản trị nội bộ ngoài phạm vi; Main System là nguồn dữ liệu sản phẩm duy nhất. `/admin` thuộc mock Main System, chỉ để minh họa luồng nhập liệu.        |
| Nếu Main System thật có giao diện khác?   | Chỉ sửa module `integration` (một interface `MainSystemClient`). Các phần khác không gọi Main trực tiếp.                                                        |
| Hai khách cùng mua món cuối cùng thì sao? | Lúc đặt hàng website hỏi Main còn hàng không (IF-03); Main là nơi quyết định. Người sau nhận thông báo không đủ hàng, không tạo đơn.                            |
| Tồn kho trên website có trễ không?        | Thay đổi ở `/admin`: khoảng 1 giây (webhook). Thay đổi khác ở Main: tối đa 1 phút (đồng bộ định kỳ).                                                            |
| Ảnh sản phẩm lưu ở đâu, có an toàn không? | Trên MinIO (tương thích S3). Chỉ Main có khóa ghi; website và khách chỉ đọc qua URL công khai. Tên file do máy chủ sinh, ảnh được kiểm định dạng theo nội dung. |
| Hệ thống chạy 24/365 thế nào?             | Web không giữ trạng thái trong bộ nhớ → chạy nhiều instance sau load balancer, health check `/api/healthz`; đơn gửi Main qua hàng đợi trong DB có thử lại.      |
| Đạt yêu cầu phản hồi dưới 2 giây chưa?    | 99% request dưới 1,9 s, 0% lỗi với 100 người dùng ảo; request chậm nhất 3,75 s trên laptop đo nên ngưỡng tuyệt đối chưa đạt — xem `tests/load/result.md`.       |
| Mật khẩu lưu thế nào?                     | Băm bcrypt; phiên đăng nhập là JWT trong cookie httpOnly; sai 5 lần khóa 15 phút.                                                                               |

## 7. Xử lý sự cố trong lúc demo

| Hiện tượng                                    | Xử lý nhanh                                                                               |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Trang mở lần đầu chậm vài giây                | Bình thường ở chế độ dev (biên dịch trang). Nói "trang đang được biên dịch lần đầu", đợi. |
| `/admin` báo "Chưa đồng bộ được sang website" | Kiểm tra đã bật lại webhook (mục 5.3); bấm "Đồng bộ ngay".                                |
| Sản phẩm mới chưa thấy trên website           | Tải lại trang; nếu vẫn chưa: `/admin` → "Đồng bộ ngay", hoặc `pnpm sync`.                 |
| Đơn không sang `/sim`                         | Kiểm tra `/sim` đang "Bình thường"; đợi 10–20 giây (worker thử lại); xem log `[worker]`.  |
| Đặt hàng báo "Hệ thống đang bận…"             | `/sim` đang "Treo" hoặc "Lỗi" → bấm "Bình thường".                                        |
| Không thấy email                              | Đợi 1–2 giây rồi tải lại Mailpit (email gửi nền).                                         |
| Sản phẩm không có ảnh                         | MinIO chưa chạy: `docker compose up -d --wait`, rồi `pnpm seed:images`.                   |
| Email thành viên "đã được đăng ký"            | Dùng email khác, ví dụ `minh.tran2@example.com`.                                          |
| Hết hàng ở biến thể định demo                 | Chọn biến thể khác, hoặc sau buổi demo chạy lại mục 2.2.                                  |

Phương án cuối: chiếu video quay sẵn của kịch bản chính (nên quay một lần trong buổi tập).

## 8. Sau buổi demo

- Tắt webhook giả lập nếu còn: `/sim/catalog-webhook` `{"enabled":true}`; `/sim` bấm "Bình thường".
- Ngừng bán sản phẩm tạo trong buổi demo ở `/admin` (hoặc chạy lại mục 2.2 để đưa Main về seed).
- Dừng `pnpm dev` (Ctrl+C) và tắt Docker (dữ liệu được giữ):

```bash
docker compose stop
```
