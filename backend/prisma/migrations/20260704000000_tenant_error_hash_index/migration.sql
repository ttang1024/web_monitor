-- DropIndex
DROP INDEX `ErrorLog_errorHash_idx` ON `ErrorLog`;

-- CreateIndex
CREATE INDEX `ErrorLog_tenantId_errorHash_idx` ON `ErrorLog`(`tenantId`, `errorHash`);
