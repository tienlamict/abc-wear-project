# Kết quả kiểm thử tải k6 — NF-01 (M6 bước 3)

Kịch bản: [k6.js](k6.js) — tăng dần 0 → 100 VU trong 30 giây rồi **giữ 100 VU trong 2 phút**; mỗi vòng
một thao tác (tìm kiếm 40%, xem chi tiết 30%, đăng nhập 20%, đặt hàng vãng lai 10%), nghỉ 1–3 giây giữa các vòng.
Ngưỡng theo spec: `http_req_duration max<2000`, `http_req_failed rate<0.01`.

Ngày đo: 15/10/2026. Lệnh: `pnpm build && pnpm start:all`, rồi `pnpm test:load` (k6 1.0.0 trong Docker).

## Môi trường

Tất cả chạy trên **một laptop**: Intel i5-1135G7 (4 nhân / 8 luồng), Windows 11, Docker Desktop (WSL2).
Cùng máy đó chạy web (4 tiến trình, `scripts/web-cluster.mjs`), worker, mock Main, MySQL 8.4, Mailpit **và chính k6**.
Trong lúc đo, CPU toàn máy 100% và xung nhịp chỉ ~58% mức danh định (Windows hạ xung), 4 tiến trình web dùng
~1 nhân mỗi tiến trình.

## Kết quả lần đo cuối

| Chỉ số                      | Giá trị                       | Ngưỡng | Đạt |
| --------------------------- | ----------------------------- | ------ | --- |
| Số request                  | 6.874 (42,7/giây), 5.240 vòng | —      |     |
| `http_req_failed`           | **0,00%** (0 / 6.874)         | < 1%   | ✅  |
| Thời gian phản hồi trung vị | 323 ms                        | —      |     |
| p90 / p95 / p99             | 1,07 s / 1,32 s / **1,90 s**  | —      |     |
| `http_req_duration` max     | **3,75 s**                    | < 2 s  | ❌  |

Theo từng luồng:

| Luồng     | Trung vị | p95    | p99    | Max    |
| --------- | -------- | ------ | ------ | ------ |
| Tìm kiếm  | 307 ms   | 1,05 s | 1,58 s | 2,63 s |
| Chi tiết  | 274 ms   | 990 ms | 1,30 s | 2,04 s |
| Đăng nhập | 289 ms   | 1,53 s | 2,10 s | 3,75 s |
| Đặt hàng  | 649 ms   | 1,69 s | 2,09 s | 3,27 s |

**Kết luận:** 99% request dưới 2 giây, không request nào lỗi; ngưỡng `max<2000` **chưa đạt** trên máy này — dưới 1%
request vượt 2 giây, cao nhất 3,75 s, xảy ra khi máy đã hết CPU. Xem phần "Đánh giá" bên dưới.

## Quá trình tìm và gỡ nút thắt

| Lần | Thay đổi                                                                                         | Trung bình | p95    | Max    |
| --- | ------------------------------------------------------------------------------------------------ | ---------- | ------ | ------ |
| 1   | `next start` một tiến trình                                                                      | 1,89 s     | 4,57 s | 8,64 s |
| 2   | 4 tiến trình qua `node:cluster`                                                                  | 1,02 s     | 3,12 s | 7,05 s |
| 5   | Cluster chia kết nối vòng tròn (`SCHED_RR`) — mặc định trên Windows dồn kết nối vào 1 tiến trình | 773 ms     | 3,03 s | 7,97 s |
| 7   | bcrypt chạy trên worker thread; email gửi nền + SMTP pool                                        | 487 ms     | 2,38 s | 6,54 s |
| 9   | Pool 2 luồng bcrypt mỗi tiến trình (lần đo cuối)                                                 | 463 ms     | 1,32 s | 3,75 s |

Các phát hiện:

- **Không phải truy vấn DB:** chỉ tìm kiếm + xem chi tiết (không đăng nhập/đặt hàng) với 100 VU: trung bình 81 ms, max 621 ms.
  MySQL dùng ~20% CPU. Mỗi trang SSR tốn ~12 ms CPU khi máy rảnh (CPU profile: React SSR 45%, Prisma 5%).
- **bcryptjs chặn event loop:** `bcryptjs` (spec mục 4) là JavaScript thuần, một lần so mật khẩu cost 10 tốn ~93 ms CPU
  và kể cả bản async cũng chỉ nhường event loop sau mỗi 100 ms. Mỗi lần đăng nhập làm mọi request khác của tiến trình
  phải chờ → chuyển sang `worker_threads` ([src/lib/password.ts](../../src/lib/password.ts)), vẫn là bcryptjs, cost 10.
- **Email chặn phản hồi đặt hàng:** SMTP sang Mailpit ~100 ms/email (có lúc 660 ms khi mở kết nối mới) → gửi sau khi
  trả phản hồi, dùng SMTP pool. Spec chỉ yêu cầu "lỗi email chỉ ghi log".
- **Một nhân không đủ:** `next start` chỉ dùng một nhân → [scripts/web-cluster.mjs](../../scripts/web-cluster.mjs) chạy
  nhiều tiến trình chung cổng; làm được vì web không giữ trạng thái trong bộ nhớ (NF-02).

## Đánh giá

- Thông lượng hiện tại (~43 request/giây với 100 người dùng nghỉ 1–3 giây) đã dùng hết CPU của laptop, trong đó k6,
  MySQL, Docker và Mailpit cùng tranh CPU với web. Phần vượt 2 giây là hàng đợi CPU, không phải lỗi hay truy vấn chậm.
- Trên môi trường đúng nghĩa (k6 chạy máy khác, web có nhân riêng, không hạ xung) hoặc thêm instance web sau load
  balancer (README, "Chạy nhiều instance"), năng lực tăng gần tuyến tính theo số nhân vì web stateless.
- Đo lại: cắm sạc và bật chế độ hiệu năng cao trên Windows trước khi chạy `pnpm test:load` sẽ cho kết quả tốt hơn đáng kể
  (máy đang chạy ~58% xung nhịp).
