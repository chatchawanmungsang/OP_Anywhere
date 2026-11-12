-- AlterTable: widen DETAIL columns that exceed legacy VARCHAR limits in real e-Claim exports
ALTER TABLE "eclaim_transaction_data"
  ALTER COLUMN "กลุ่มยาตามบัญชีฯ (NHSO)" TYPE TEXT,
  ALTER COLUMN "กลุ่มยาตามโรค" TYPE TEXT,
  ALTER COLUMN "hmain_refer_in" TYPE VARCHAR(255);
