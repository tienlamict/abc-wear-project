-- Synthetic catalog for EXPLAIN on a realistic size (selling_perf only, never the dev DB):
-- 6 categories (2 levels), 20,000 products, 5 variants each = 100,000 variants.
-- Usage: docker exec -i abcwear-mysql mysql -uroot -proot selling_perf < tests/load/perf-seed.sql
SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;
SET SESSION cte_max_recursion_depth = 100000;
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE product_variant;
TRUNCATE product;
TRUNCATE category;
SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO category (id, parentId, name, slug) VALUES
  ('CAT-NAM', NULL, 'Nam', 'nam'),
  ('CAT-NAM-AO-THUN', 'CAT-NAM', 'Áo thun nam', 'ao-thun-nam'),
  ('CAT-NAM-QUAN', 'CAT-NAM', 'Quần nam', 'quan-nam'),
  ('CAT-NU', NULL, 'Nữ', 'nu'),
  ('CAT-NU-AO', 'CAT-NU', 'Áo nữ', 'ao-nu'),
  ('CAT-NU-VAY', 'CAT-NU', 'Váy đầm', 'vay-dam');

INSERT INTO product (id, categoryId, name, description, images, isActive, createdAt, syncedAt)
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 20000)
SELECT
  CONCAT('X', LPAD(i, 6, '0')),
  ELT(1 + i % 4, 'CAT-NAM-AO-THUN', 'CAT-NAM-QUAN', 'CAT-NU-AO', 'CAT-NU-VAY'),
  CONCAT(ELT(1 + i % 4, 'Áo thun nam', 'Quần jeans nam', 'Áo sơ mi nữ', 'Đầm suông'), ' mẫu ', i),
  CONCAT('Chất liệu ', ELT(1 + i % 3, 'cotton 100%', 'kaki co giãn', 'linen'), ', form rộng thoải mái. Giặt máy ở nhiệt độ thường.'),
  JSON_ARRAY(CONCAT('http://localhost:9000/product-images/products/P000001/seed-1.webp')),
  i % 50 <> 0, -- 2% inactive
  TIMESTAMP('2025-01-01') + INTERVAL i MINUTE,
  NOW(3)
FROM n;

INSERT INTO product_variant (sku, productId, size, color, price, availableQty)
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 20000),
s(k, size) AS (SELECT 1, 'S' UNION ALL SELECT 2, 'M' UNION ALL SELECT 3, 'L' UNION ALL SELECT 4, 'XL' UNION ALL SELECT 5, 'XXL')
SELECT
  CONCAT('X', LPAD(i, 6, '0'), '-', size),
  CONCAT('X', LPAD(i, 6, '0')),
  size,
  ELT(1 + (i + k) % 6, 'Đen', 'Trắng', 'Xám', 'Be', 'Xanh navy', 'Đỏ đô'),
  150000 + (i % 70) * 10000 + IF(size = 'XXL', 30000, 0),
  (i * k) % 40
FROM n CROSS JOIN s;

ANALYZE TABLE product, product_variant;
SELECT (SELECT COUNT(*) FROM product) AS products, (SELECT COUNT(*) FROM product_variant) AS variants;
