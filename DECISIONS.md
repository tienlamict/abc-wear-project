# DECISIONS

Mỗi dòng: một điểm spec chưa rõ và cách đã chọn.

- **M0** — Dev dùng user `root` / `root` của MySQL (khớp `DATABASE_URL` trong `.env.example`); Prisma cần quyền tạo shadow DB.
- **M0** — Worker và mock đọc `.env` bằng `process.loadEnvFile()` có sẵn của Node (≥ 20.12), không thêm `dotenv`. Next.js tự đọc `.env`.
- **M0** — Alias import: `@/*` → `src/*`, `@/components/*` → `components/*` (dùng chung cho Next, tsx, Vitest).
- **M0** — Mock tách `mock-main/app.ts` (dựng Fastify app, dùng được trong test qua `inject`) và `mock-main/server.ts` (chỉ listen port 4100, đổi được bằng `MOCK_MAIN_PORT`).
- **M0** — `pnpm lint` dùng `eslint .` (config `next/core-web-vitals` + `next/typescript` + `prettier`) để lint cả `worker/`, `mock-main/`, `tests/`, không chỉ thư mục mặc định của `next lint`.
- **M0** — zod bản 4 (bản mới nhất lúc khởi tạo).
