# EXPLAIN — `listProducts()` (M6 bước 1)

Truy vấn kiểm tra: các dạng SQL mà `listProducts()` gửi đi ([src/modules/catalog/queries.ts](../../src/modules/catalog/queries.ts)),
chép trong [explain-listProducts.sql](explain-listProducts.sql).

Với dữ liệu demo (40 sản phẩm, 195 biến thể), MySQL quét toàn bảng nên kế hoạch thực thi không có ý nghĩa
(mỗi truy vấn < 2 ms). Vì vậy đo trên DB riêng `selling_perf` gồm **20.000 sản phẩm, 100.000 biến thể**
sinh bằng [perf-seed.sql](perf-seed.sql). MySQL 8.4 trong docker-compose, `EXPLAIN ANALYZE`, ngày 15/10/2026.

## Kết quả

| #   | Truy vấn                                        | Trước                                 | Sau khi thêm chỉ mục                                           |
| --- | ----------------------------------------------- | ------------------------------------- | -------------------------------------------------------------- |
| 1   | Trang chủ / tất cả, mới nhất                    | 339 ms — đọc 98.000 dòng biến thể     | 210 ms — _covering index lookup_ `(productId, price)`          |
| 2   | Danh mục cha (3 id), mới nhất                   | 204 ms                                | 74 ms — _covering index lookup_                                |
| 3   | Từ khóa "ao thun", mới nhất                     | 112 ms                                | 57 ms — _covering index lookup_                                |
| 4   | Danh mục + size M + giá 200k–400k, giá tăng dần | 61 ms — _table scan_ 100.000 biến thể | 54 ms — _index range scan_ `(size, price)`, chỉ đọc 6.006 dòng |
| 5   | Đếm tổng cho (4)                                | 54 ms — _table scan_                  | 59 ms — _index range scan_                                     |

Chỉ mục thêm (migration `variant_listing_indexes`):

- `product_variant(productId, price)` — `MIN/MAX(price)` của từng sản phẩm lấy thẳng từ chỉ mục, không đọc dòng.
- `product_variant(size, price)` — lọc size + khoảng giá thành quét theo khoảng thay vì quét toàn bảng.

Không đổi được bằng chỉ mục:

- `LIKE '%từ khóa%'` trên tên và mô tả luôn phải quét `product` (B-tree không dùng được cho `%` đầu chuỗi).
  20.000 dòng mất ~25 ms. Đủ cho quy mô hiện tại; nếu catalog lớn hơn nhiều thì chuyển sang FULLTEXT/công cụ tìm kiếm
  (spec mục 15: Meilisearch là giai đoạn 2).
- Sắp xếp "mới nhất" vẫn gộp mọi biến thể khớp rồi mới sắp. Ở 20.000 sản phẩm truy vấn trang chủ còn ~200 ms; bước tiếp
  theo (nếu cần) là truy vấn lấy 24 sản phẩm theo `product(isActive, createdAt)` trước rồi mới tính giá.

Ở quy mô demo mọi truy vấn đều dưới 2 ms; kết quả tải thực tế xem [result.md](result.md).

## Chạy lại

```bash
DATABASE_URL=mysql://root:root@localhost:3306/selling_perf pnpm exec prisma migrate deploy
```

```bash
docker exec -i abcwear-mysql mysql -uroot -proot selling_perf < tests/load/perf-seed.sql
```

```bash
docker exec -i abcwear-mysql mysql -uroot -proot --raw -N selling_perf < tests/load/explain-listProducts.sql
```

Xóa DB khi xong: `docker exec abcwear-mysql mysql -uroot -proot -e "DROP DATABASE selling_perf"`.

## Kế hoạch sau khi thêm chỉ mục (rút gọn)

```
1. -> Limit: 24 row(s)  (actual time=210..210 rows=24 loops=1)
     -> Covering index lookup on v using product_variant_productId_price_idx (productId=p.id) (rows=5 loops=19600)
4. -> Limit: 24 row(s)  (actual time=54..54 rows=24 loops=1)
     -> Index range scan on v using product_variant_size_price_idx
        over (size = 'M' AND 200000 <= price <= 400000)
```
