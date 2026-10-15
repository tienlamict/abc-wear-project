-- CreateIndex
CREATE INDEX `product_variant_productId_price_idx` ON `product_variant`(`productId`, `price`);

-- CreateIndex
CREATE INDEX `product_variant_size_price_idx` ON `product_variant`(`size`, `price`);
