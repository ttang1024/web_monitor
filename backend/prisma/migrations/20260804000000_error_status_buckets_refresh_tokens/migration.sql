-- The tenantId FK is dropped only so its backing index can be replaced; it is
-- restored at the end of this migration.
-- DropForeignKey
ALTER TABLE `ErrorLog` DROP FOREIGN KEY `ErrorLog_tenantId_fkey`;

-- DropIndex
DROP INDEX `ErrorLog_tenantId_errorHash_idx` ON `ErrorLog`;

-- AlterTable
ALTER TABLE `ErrorLog` ADD COLUMN `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `status` ENUM('Unresolved', 'Resolved', 'Ignored') NOT NULL DEFAULT 'Unresolved';

-- Existing rows: seed lastSeenAt from the row's own history.
UPDATE `ErrorLog` SET `lastSeenAt` = COALESCE(`updatedAt`, `createdAt`);

-- CreateTable
CREATE TABLE `RefreshToken` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RefreshToken_tokenHash_key`(`tokenHash`),
    INDEX `RefreshToken_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ErrorBucket` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `errorHash` VARCHAR(191) NOT NULL,
    `bucketStart` DATETIME(3) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 0,

    INDEX `ErrorBucket_tenantId_bucketStart_idx`(`tenantId`, `bucketStart`),
    UNIQUE INDEX `ErrorBucket_tenantId_errorHash_bucketStart_key`(`tenantId`, `errorHash`, `bucketStart`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ErrorLog_tenantId_status_lastSeenAt_idx` ON `ErrorLog`(`tenantId`, `status`, `lastSeenAt`);

-- One row per (tenant, errorHash): makes the ingest upsert atomic instead of
-- racing two concurrent inserts into duplicate rows.
-- CreateIndex
CREATE UNIQUE INDEX `ErrorLog_tenantId_errorHash_key` ON `ErrorLog`(`tenantId`, `errorHash`);

-- AddForeignKey
ALTER TABLE `RefreshToken` ADD CONSTRAINT `RefreshToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ErrorBucket` ADD CONSTRAINT `ErrorBucket_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ErrorLog` ADD CONSTRAINT `ErrorLog_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
