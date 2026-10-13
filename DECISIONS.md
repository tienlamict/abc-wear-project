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
