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
pnpm dev
```

`pnpm dev` chạy song song ba tiến trình:

| Tiến trình | Địa chỉ                       | Mô tả                                                |
| ---------- | ----------------------------- | ---------------------------------------------------- |
| `web`      | http://localhost:3000         | Next.js (trang + `/api`)                             |
| `worker`   | —                             | Đồng bộ với Main System, gửi đơn (`worker/index.ts`) |
| `mock`     | http://localhost:4100/healthz | Mock Main System (`mock-main/`)                      |

Dịch vụ trong Docker:

| Dịch vụ   | Địa chỉ                                                |
| --------- | ------------------------------------------------------ |
| MySQL 8.4 | `localhost:3306`, DB `selling`, user `root` / `root`   |
| Mailpit   | SMTP `localhost:1025`, giao diện http://localhost:8025 |

Kiểm tra container đã healthy: `docker compose ps`.

## Lệnh

| Lệnh             | Việc                      |
| ---------------- | ------------------------- |
| `pnpm dev`       | Chạy web + worker + mock  |
| `pnpm test`      | Unit test (Vitest)        |
| `pnpm lint`      | ESLint                    |
| `pnpm typecheck` | TypeScript `tsc --noEmit` |
| `pnpm format`    | Prettier                  |

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
tests/          unit | e2e | load
```

Tiến độ: [PROGRESS.md](PROGRESS.md). Quyết định kỹ thuật: [DECISIONS.md](DECISIONS.md).
