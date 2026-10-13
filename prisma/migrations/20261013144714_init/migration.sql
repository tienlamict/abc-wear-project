-- CreateTable
CREATE TABLE `category` (
    `id` VARCHAR(64) NOT NULL,
    `parentId` VARCHAR(64) NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `category_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product` (
    `id` VARCHAR(64) NOT NULL,
    `categoryId` VARCHAR(64) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NOT NULL,
    `images` JSON NOT NULL,
    `isActive` BOOLEAN NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `syncedAt` DATETIME(3) NOT NULL,

    INDEX `product_categoryId_isActive_idx`(`categoryId`, `isActive`),
    INDEX `product_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_variant` (
    `sku` VARCHAR(64) NOT NULL,
    `productId` VARCHAR(64) NOT NULL,
    `size` VARCHAR(16) NOT NULL,
    `color` VARCHAR(64) NOT NULL,
    `price` INTEGER NOT NULL,
    `availableQty` INTEGER NOT NULL,

    INDEX `product_variant_productId_idx`(`productId`),
    INDEX `product_variant_price_idx`(`price`),
    PRIMARY KEY (`sku`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `member` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `shipLine1` VARCHAR(255) NULL,
    `shipWard` VARCHAR(100) NULL,
    `shipDistrict` VARCHAR(100) NULL,
    `shipProvince` VARCHAR(100) NULL,
    `failedLogins` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `member_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cart` (
    `id` CHAR(36) NOT NULL,
    `memberId` CHAR(36) NULL,
    `sessionId` CHAR(36) NULL,

    UNIQUE INDEX `cart_memberId_key`(`memberId`),
    UNIQUE INDEX `cart_sessionId_key`(`sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cart_item` (
    `cartId` CHAR(36) NOT NULL,
    `sku` VARCHAR(64) NOT NULL,
    `quantity` INTEGER NOT NULL,

    PRIMARY KEY (`cartId`, `sku`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `idempotencyKey` CHAR(36) NOT NULL,
    `memberId` CHAR(36) NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `customerEmail` VARCHAR(191) NOT NULL,
    `customerPhone` VARCHAR(20) NOT NULL,
    `shipLine1` VARCHAR(255) NOT NULL,
    `shipWard` VARCHAR(100) NOT NULL,
    `shipDistrict` VARCHAR(100) NOT NULL,
    `shipProvince` VARCHAR(100) NOT NULL,
    `shippingMethod` VARCHAR(32) NOT NULL,
    `shippingFee` INTEGER NOT NULL,
    `itemsTotal` INTEGER NOT NULL,
    `codAmount` INTEGER NOT NULL,
    `status` ENUM('CONFIRMED', 'SENT_TO_MAIN', 'PICKING', 'SHIPPING', 'DELIVERED', 'DELIVERY_FAILED') NOT NULL DEFAULT 'CONFIRMED',
    `sendAttempts` INTEGER NOT NULL DEFAULT 0,
    `nextSendAt` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSendError` TEXT NULL,
    `mainOrderId` VARCHAR(64) NULL,
    `trackingNumber` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `orders_code_key`(`code`),
    UNIQUE INDEX `orders_idempotencyKey_key`(`idempotencyKey`),
    INDEX `orders_memberId_createdAt_idx`(`memberId`, `createdAt`),
    INDEX `orders_status_nextSendAt_idx`(`status`, `nextSendAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_item` (
    `id` CHAR(36) NOT NULL,
    `orderId` CHAR(36) NOT NULL,
    `sku` VARCHAR(64) NOT NULL,
    `productName` VARCHAR(255) NOT NULL,
    `size` VARCHAR(16) NOT NULL,
    `color` VARCHAR(64) NOT NULL,
    `unitPrice` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sync_log` (
    `id` CHAR(36) NOT NULL,
    `direction` VARCHAR(3) NOT NULL,
    `iface` VARCHAR(8) NOT NULL,
    `recordKey` VARCHAR(64) NULL,
    `result` VARCHAR(8) NOT NULL,
    `message` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sync_log_iface_createdAt_idx`(`iface`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `category` ADD CONSTRAINT `category_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product` ADD CONSTRAINT `product_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_variant` ADD CONSTRAINT `product_variant_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cart_item` ADD CONSTRAINT `cart_item_cartId_fkey` FOREIGN KEY (`cartId`) REFERENCES `cart`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_item` ADD CONSTRAINT `order_item_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
