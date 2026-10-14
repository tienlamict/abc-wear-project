# DECISIONS

Mỗi dòng: một điểm spec chưa rõ và cách đã chọn.

- **M0** — Dev dùng user `root` / `root` của MySQL (khớp `DATABASE_URL` trong `.env.example`); Prisma cần quyền tạo shadow DB.
- **M0** — Worker và mock đọc `.env` bằng `process.loadEnvFile()` có sẵn của Node (≥ 20.12), không thêm `dotenv`. Next.js tự đọc `.env`.
- **M0** — Alias import: `@/*` → `src/*`, `@/components/*` → `components/*` (dùng chung cho Next, tsx, Vitest).
- **M0** — Mock tách `mock-main/app.ts` (dựng Fastify app, dùng được trong test qua `inject`) và `mock-main/server.ts` (chỉ listen port 4100, đổi được bằng `MOCK_MAIN_PORT`).
- **M0** — `pnpm lint` dùng `eslint .` (config `next/core-web-vitals` + `next/typescript` + `prettier`) để lint cả `worker/`, `mock-main/`, `tests/`, không chỉ thư mục mặc định của `next lint`.
- **M0** — zod bản 4 (bản mới nhất lúc khởi tạo).
- **M1** — Prisma 6.19 (không lên 7/8): giữ đúng cú pháp schema ở spec (`prisma-client-js`, `url = env(...)` trong `datasource`).
- **M1** — Prisma luôn sinh bảng `utf8mb4_unicode_ci`; migration thứ hai `collation_0900_ai_ci` đổi mọi bảng sang `utf8mb4_0900_ai_ci` (tắt `FOREIGN_KEY_CHECKS` trong lúc đổi). `prisma migrate dev` không thấy drift.
- **M1** — Thêm mã lỗi `INTERNAL_ERROR` (500) cho lỗi không lường trước; chi tiết lỗi không lộ ra client. HTTP status: 400 validate/token/giỏ rỗng, 401, 404, 409 trùng email/hết hàng, 423 khóa tài khoản, 503 Main không trả lời. Lỗi zod kèm `details.fields`; thông báo trường dùng locale `vi` của zod.
- **M1** — Mã đơn `ABC-YYMMDD-XXXXX`: ngày theo giờ Việt Nam (UTC+7); 5 ký tự từ bảng chữ không có `0 O 1 I`.
- **M1** — `transition()` trả `changed | unchanged | invalid`; cùng trạng thái = `unchanged` (bỏ qua, idempotent); không cho nhảy cóc trạng thái.
- **M1** — Seed mock: 2 danh mục cha (Nam, Nữ) × 2 con; sản phẩm chỉ gắn danh mục con; size trong `S…XXL`, XXL đắt hơn 30.000 ₫; P007 và P026 hết hàng toàn bộ. `createdAt` lấy từ Main (để sắp xếp "mới nhất" có nghĩa).
- **M1** — Ảnh placeholder là SVG do mock phục vụ (`/images/P001-1.svg`), không phụ thuộc mạng ngoài; catalog trả URL tuyệt đối theo host của request.
- **M1** — IF-01 tạo biến thể mới với `availableQty = 0` (tồn kho chỉ đến từ IF-02). Biến thể vắng mặt khỏi snapshot → `availableQty = 0`. Danh mục vắng mặt giữ nguyên (còn khóa ngoại). IF-02 chỉ cập nhật dòng thay đổi; tồn kho âm coi như 0; SKU lạ bỏ qua.
- **M1** — `sync_log`: client ghi một dòng cho mỗi lần gọi Main (OK/ERROR); hàm sync ghi thêm dòng ERROR `apply failed` nếu lỗi khi ghi DB. Payload Main được validate bằng zod.
- **M1** — Worker: nếu lần IF-01 đầu tiên lỗi (Main chưa lên, ví dụ khi `pnpm dev`), thử lại mỗi 15 giây đến khi được rồi chạy IF-02 ngay; sau đó theo chu kỳ 10 phút / 1 phút; job không chạy chồng.
- **M1** — Test integration chạy trên DB riêng `selling_test` (tự `prisma migrate deploy` trong global setup, đổi được bằng `TEST_DATABASE_URL`); `pnpm test` chạy cả unit và integration nên cần MySQL đang chạy.
- **M2** — `listProducts()` dùng `prisma.$queryRaw` với `Prisma.sql` (tham số hóa, không ghép chuỗi) vì Prisma không sắp xếp được theo `MIN(price)` của quan hệ. Sản phẩm khớp khi **một** biến thể thỏa đồng thời size, màu, khoảng giá; giá hiển thị và sắp xếp là giá thấp nhất trong các biến thể khớp ("Từ …" khi các biến thể khớp khác giá).
- **M2** — `size`, `color` nhận nhiều giá trị (`size=M&size=L` hoặc `size=M,L`). Query sai: API trả 400 `VALIDATION_ERROR`; trang bỏ qua trường sai. `category` không tồn tại: API trả 404 `NOT_FOUND`. Ký tự `%`, `_` trong từ khóa được escape (tìm đúng nghĩa đen).
- **M2** — Bộ lọc hiển thị size/màu có trong phạm vi từ khóa + danh mục (không phụ thuộc bộ lọc size/màu/giá đang chọn).
- **M2** — Sản phẩm `isActive = false` không xuất hiện trong danh sách nhưng trang chi tiết vẫn mở được, ghi "tạm ngừng kinh doanh" và không mua được (QT6).
- **M2** — Ảnh sản phẩm là SVG do Main phục vụ nên `next/image` đặt `images.unoptimized`. Root layout `dynamic = "force-dynamic"`: mọi trang đọc DB lúc request (tồn kho đổi mỗi phút), không prerender lúc build.
- **M2** — `loading.tsx` đặt theo từng segment (`(home)`, `tim-kiem`, `danh-muc/[slug]`, `san-pham/[id]`), không đặt ở gốc; segment động kiểm tra tồn tại trong `layout.tsx` (nằm ngoài Suspense của segment) để trang không tồn tại trả HTTP 404 thật thay vì 200 do streaming.
- **M2** — Nút "Thêm vào giỏ" ở M2 chỉ hiện thông báo "đang hoàn thiện"; giỏ hàng làm ở M4. Header có sẵn link Giỏ hàng (0), Đăng nhập, Tra cứu đơn (trang làm ở M3–M5).
- **M2** — Playwright mặc định dùng Google Chrome đã cài trên máy (`channel: "chrome"`, vẫn là Chromium) để không phải tải trình duyệt; đổi bằng `PW_CHANNEL=chromium` (sau `pnpm exec playwright install chromium`) hoặc `PW_CHANNEL=msedge`.
- **M2** — E2E chạy trên môi trường dev (DB `selling`, mock 4100, web 3000): dùng lại `pnpm dev` nếu đang chạy, không thì Playwright tự khởi động; project `setup` chờ mock rồi chạy `pnpm sync` trước khi test. Test đọc trạng thái tồn kho thật qua API thay vì giả định theo seed.
- **M3** — Phiên: JWT HS256 (`jose`) ký bằng `JWT_SECRET`, claim `typ` phân biệt `session` / `pwreset` để token loại này không dùng thay loại kia. Cookie `session`: httpOnly, SameSite=Lax, 7 ngày, `Secure` khi `WEB_BASE_URL` là https. Không có refresh token, không thu hồi phiên khi đổi mật khẩu (spec mục 15).
- **M3** — Đăng ký xong đăng nhập luôn (đặt cookie), chuyển tới `?next=` hoặc `/tai-khoan`. `?next=` chỉ nhận đường dẫn tương đối cùng site.
- **M3** — QT9: mỗi lần sai tăng `failedLogins` (atomic); lần thứ 5 đặt `lockedUntil = now + 15 phút` và đưa bộ đếm về 0; đang khóa thì đúng mật khẩu cũng bị từ chối (423 `ACCOUNT_LOCKED`, báo số phút còn lại). Đăng nhập đúng xóa bộ đếm. Email lạ và mật khẩu sai trả cùng thông báo, cùng chi phí bcrypt.
- **M3** — Token đặt lại mật khẩu (30 phút) chứa dấu vân tay (SHA-256 rút gọn) của `passwordHash` lúc phát hành, nên dùng một lần: đổi mật khẩu xong token cũ hết hiệu lực. Đặt lại mật khẩu cũng mở khóa tài khoản. `forgot-password` luôn trả `{ ok: true }`; lỗi gửi mail chỉ ghi log.
- **M3** — Mật khẩu 8–72 ký tự (72 là giới hạn của bcrypt), bcrypt cost 10. SĐT tùy chọn: 10 số bắt đầu bằng 0 hoặc `+84` + 9 số (bỏ khoảng trắng, dấu chấm, gạch). `PATCH /api/me`: trường không gửi giữ nguyên, trường rỗng thành `null`; email không đổi được.
- **M3** — `middleware.ts` (Edge) chỉ kiểm chữ ký JWT cho `/tai-khoan` và `/tai-khoan/*`; trang vẫn tải member từ DB và chuyển về đăng nhập nếu member không còn. Đã đăng nhập mà vào `/dang-nhap`, `/dang-ky` thì chuyển tới `next`.
- **M3** — Lỗi gọi API ở form hiển thị `message` chung + lỗi từng trường từ `details.fields`. Kiểm "nhập lại mật khẩu" chỉ làm ở client.
- **M3** — Gộp giỏ vãng lai khi đăng nhập (QT10) làm cùng giỏ hàng ở M4.
- **M3** — Test integration thay `sendEmail` bằng mock (đọc link trong email); E2E đọc email thật qua API Mailpit (`tests/e2e/helpers/mailpit.ts`, đổi bằng `MAILPIT_URL`). Tài khoản E2E dùng email `e2e-…@e2e.abcwear.test`, để lại trong DB dev.
