-- AlterTable: a resolved error that recurs is reopened as `Regressed`.
ALTER TABLE `ErrorLog` MODIFY `status` ENUM('Unresolved', 'Resolved', 'Ignored', 'Regressed') NOT NULL DEFAULT 'Unresolved';
