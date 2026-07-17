-- Extend UploadStatus enum
ALTER TYPE "UploadStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED';
ALTER TYPE "UploadStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "UploadStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- UploadBatch job queue fields
ALTER TABLE "UploadBatch" ADD COLUMN IF NOT EXISTS "rowsSkipped" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UploadBatch" ADD COLUMN IF NOT EXISTS "filterProv1" TEXT NOT NULL DEFAULT '';
ALTER TABLE "UploadBatch" ADD COLUMN IF NOT EXISTS "filterProv2" TEXT NOT NULL DEFAULT '';
ALTER TABLE "UploadBatch" ADD COLUMN IF NOT EXISTS "dataYearThai" INTEGER NOT NULL DEFAULT 2568;
ALTER TABLE "UploadBatch" ADD COLUMN IF NOT EXISTS "dataMonthThai" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "UploadBatch" ADD COLUMN IF NOT EXISTS "dataPeriod" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "UploadBatch" ADD COLUMN IF NOT EXISTS "archivedFilePath" TEXT;
ALTER TABLE "UploadBatch" ADD COLUMN IF NOT EXISTS "fileSizeBytes" BIGINT;
ALTER TABLE "UploadBatch" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "UploadBatch" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3);
ALTER TABLE "UploadBatch" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "UploadBatch" ADD COLUMN IF NOT EXISTS "progressRows" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UploadBatch" ADD COLUMN IF NOT EXISTS "sheetsProcessed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UploadBatch" ADD COLUMN IF NOT EXISTS "rowsPerSheet" JSONB;

-- Import metadata on summary rows
ALTER TABLE "eclaim_transaction_summary" ADD COLUMN IF NOT EXISTS "import_year_thai" INTEGER NOT NULL DEFAULT 2568;
ALTER TABLE "eclaim_transaction_summary" ADD COLUMN IF NOT EXISTS "import_month_thai" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "eclaim_transaction_summary" ADD COLUMN IF NOT EXISTS "import_period" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "eclaim_transaction_summary" ADD COLUMN IF NOT EXISTS "import_file_name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "eclaim_transaction_summary" ADD COLUMN IF NOT EXISTS "import_uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "eclaim_transaction_summary"
SET "import_file_name" = "source_file_name"
WHERE "import_file_name" = '';

-- Import metadata on detail rows
ALTER TABLE "eclaim_transaction_data" ADD COLUMN IF NOT EXISTS "import_year_thai" INTEGER NOT NULL DEFAULT 2568;
ALTER TABLE "eclaim_transaction_data" ADD COLUMN IF NOT EXISTS "import_month_thai" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "eclaim_transaction_data" ADD COLUMN IF NOT EXISTS "import_period" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "eclaim_transaction_data" ADD COLUMN IF NOT EXISTS "import_file_name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "eclaim_transaction_data" ADD COLUMN IF NOT EXISTS "import_uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "eclaim_transaction_data" ADD COLUMN IF NOT EXISTS "source_sheet_index" INTEGER;

UPDATE "eclaim_transaction_data"
SET "import_file_name" = "source_file_name"
WHERE "import_file_name" = '';

CREATE INDEX IF NOT EXISTS "eclaim_transaction_summary_import_year_thai_import_month_thai_import_period_idx"
  ON "eclaim_transaction_summary"("import_year_thai", "import_month_thai", "import_period");

CREATE INDEX IF NOT EXISTS "eclaim_transaction_data_import_year_thai_import_month_thai_import_period_idx"
  ON "eclaim_transaction_data"("import_year_thai", "import_month_thai", "import_period");
