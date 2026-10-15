-- The query shapes listProducts() sends (src/modules/catalog/queries.ts), for EXPLAIN ANALYZE.
-- Usage: docker exec -i abcwear-mysql mysql -uroot -proot selling_perf < tests/load/explain-listProducts.sql
SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;

SELECT '1. home / all products, newest' AS q;
EXPLAIN ANALYZE
SELECT p.id, MIN(v.price) AS minPrice, MAX(v.price) AS maxPrice
FROM product p JOIN product_variant v ON v.productId = p.id
WHERE p.isActive = TRUE
GROUP BY p.id ORDER BY p.createdAt DESC, p.id ASC LIMIT 24 OFFSET 0;

SELECT '2. parent category (nam = 3 ids), newest' AS q;
EXPLAIN ANALYZE
SELECT p.id, MIN(v.price) AS minPrice, MAX(v.price) AS maxPrice
FROM product p JOIN product_variant v ON v.productId = p.id
WHERE p.isActive = TRUE AND p.categoryId IN ('CAT-NAM', 'CAT-NAM-AO-THUN', 'CAT-NAM-QUAN')
GROUP BY p.id ORDER BY p.createdAt DESC, p.id ASC LIMIT 24 OFFSET 0;

SELECT '3. keyword "ao thun", newest' AS q;
EXPLAIN ANALYZE
SELECT p.id, MIN(v.price) AS minPrice, MAX(v.price) AS maxPrice
FROM product p JOIN product_variant v ON v.productId = p.id
WHERE p.isActive = TRUE AND (p.name LIKE '%ao thun%' OR p.description LIKE '%ao thun%')
GROUP BY p.id ORDER BY p.createdAt DESC, p.id ASC LIMIT 24 OFFSET 0;

SELECT '4. category + size M + price 200k-400k, price ascending' AS q;
EXPLAIN ANALYZE
SELECT p.id, MIN(v.price) AS minPrice, MAX(v.price) AS maxPrice
FROM product p JOIN product_variant v ON v.productId = p.id
WHERE p.isActive = TRUE AND p.categoryId IN ('CAT-NAM', 'CAT-NAM-AO-THUN', 'CAT-NAM-QUAN')
  AND v.size IN ('M') AND v.price >= 200000 AND v.price <= 400000
GROUP BY p.id ORDER BY minPrice ASC, p.id ASC LIMIT 24 OFFSET 0;

SELECT '5. count for (4)' AS q;
EXPLAIN ANALYZE
SELECT COUNT(DISTINCT p.id) AS total
FROM product p JOIN product_variant v ON v.productId = p.id
WHERE p.isActive = TRUE AND p.categoryId IN ('CAT-NAM', 'CAT-NAM-AO-THUN', 'CAT-NAM-QUAN')
  AND v.size IN ('M') AND v.price >= 200000 AND v.price <= 400000;
