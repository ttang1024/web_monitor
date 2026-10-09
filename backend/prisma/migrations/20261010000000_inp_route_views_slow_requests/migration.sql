-- INP replaces FID as the interactivity vital. FID values are not INP values,
-- so the old column is dropped rather than renamed. Older SDKs that still
-- send fid are unaffected: unknown metrics are ignored at ingest.
ALTER TABLE `PerformanceMetric` DROP COLUMN `fid`,
    ADD COLUMN `inp` DOUBLE NULL,
    ADD COLUMN `navigationType` VARCHAR(191) NULL;

-- Request duration, for failures and for successful requests reported as slow.
ALTER TABLE `ApiError` ADD COLUMN `durationMs` DOUBLE NULL;
