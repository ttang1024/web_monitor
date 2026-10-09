-- AlterTable
ALTER TABLE `User` ADD COLUMN `tokenVersion` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `IngestBatch` (
    `tenantId` CHAR(36) NOT NULL,
    `batchId` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `IngestBatch_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`tenantId`, `batchId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SchedulerLease` (
    `name` VARCHAR(64) NOT NULL,
    `holder` VARCHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `AlertNotification_createdAt_idx` ON `AlertNotification`(`createdAt`);

-- CreateIndex
CREATE INDEX `ApiError_createdAt_idx` ON `ApiError`(`createdAt`);

-- CreateIndex
CREATE INDEX `CustomEvent_createdAt_idx` ON `CustomEvent`(`createdAt`);

-- Earlier builds saved a new row on every save; keep the newest copy per name
-- so the unique index below can be created.
DELETE d1 FROM `DashboardLayout` d1
  JOIN `DashboardLayout` d2
    ON d1.userId = d2.userId AND d1.name = d2.name
   AND (d1.createdAt < d2.createdAt OR (d1.createdAt = d2.createdAt AND d1.id < d2.id));

-- CreateIndex
CREATE UNIQUE INDEX `DashboardLayout_userId_name_key` ON `DashboardLayout`(`userId`, `name`);

-- CreateIndex
CREATE INDEX `ErrorBucket_bucketStart_idx` ON `ErrorBucket`(`bucketStart`);

-- CreateIndex
CREATE INDEX `ErrorLog_lastSeenAt_idx` ON `ErrorLog`(`lastSeenAt`);

-- CreateIndex
CREATE INDEX `PerformanceMetric_createdAt_idx` ON `PerformanceMetric`(`createdAt`);

