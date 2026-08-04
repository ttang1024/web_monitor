-- The plain index on User.email is replaced by a unique one. register() checked
-- for a taken address with a SELECT before its INSERT, which two concurrent
-- sign-ups could both pass; the constraint is what actually prevents it.
-- Note for an existing deployment: creating the unique index fails if the table
-- already holds duplicate addresses, so resolve those before deploying.
-- DropIndex
DROP INDEX `User_email_idx` ON `User`;

-- CreateIndex
CREATE UNIQUE INDEX `User_email_key` ON `User`(`email`);

-- CreateTable
CREATE TABLE `AlertRule` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `condition` ENUM('NewIssue', 'ErrorSpike', 'ErrorRate', 'SlowPageLoad') NOT NULL,
    `threshold` DOUBLE NOT NULL DEFAULT 0,
    `windowMinutes` INTEGER NOT NULL DEFAULT 60,
    `severity` ENUM('Info', 'Warning', 'Critical') NOT NULL DEFAULT 'Warning',
    `isEnabled` BOOLEAN NOT NULL DEFAULT true,
    `cooldownMinutes` INTEGER NOT NULL DEFAULT 60,
    `lastTriggeredAt` DATETIME(3) NULL,
    `webhookUrl` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NULL,

    INDEX `AlertRule_tenantId_isEnabled_idx`(`tenantId`, `isEnabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AlertNotification` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `alertRuleId` CHAR(36) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `severity` ENUM('Info', 'Warning', 'Critical') NOT NULL,
    `observedValue` DOUBLE NOT NULL,
    `threshold` DOUBLE NOT NULL,
    `errorHash` VARCHAR(191) NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `deliveredAt` DATETIME(3) NULL,
    `deliveryError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AlertNotification_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    INDEX `AlertNotification_tenantId_isRead_idx`(`tenantId`, `isRead`),
    INDEX `AlertNotification_alertRuleId_idx`(`alertRuleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AlertRule` ADD CONSTRAINT `AlertRule_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AlertNotification` ADD CONSTRAINT `AlertNotification_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AlertNotification` ADD CONSTRAINT `AlertNotification_alertRuleId_fkey` FOREIGN KEY (`alertRuleId`) REFERENCES `AlertRule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
