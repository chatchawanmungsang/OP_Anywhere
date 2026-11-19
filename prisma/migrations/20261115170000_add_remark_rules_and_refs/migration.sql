-- AlterTable: add remark columns and index on eclaim_transaction_summary
ALTER TABLE "eclaim_transaction_summary"
  ADD COLUMN IF NOT EXISTS "remark_status" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "remark_rule_code" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "remark_note" TEXT,
  ADD COLUMN IF NOT EXISTS "remarked_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "eclaim_summary_period_remark_status_idx"
  ON "eclaim_transaction_summary"("import_year_thai", "import_month_thai", "import_period", "remark_status");

-- CreateTable: remark_rules
CREATE TABLE IF NOT EXISTS "remark_rules" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "remark_text" TEXT NOT NULL,
    "outcome" VARCHAR(20) NOT NULL DEFAULT 'PRUNED_OUT',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "condition_mode" VARCHAR(20) NOT NULL DEFAULT 'BUILDER',
    "conditions_json" JSONB,
    "sql_where" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "remark_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "remark_rules_code_key" ON "remark_rules"("code");
CREATE INDEX IF NOT EXISTS "remark_rules_active_priority_idx" ON "remark_rules"("active", "priority");

-- CreateTable: ref_cup_network
CREATE TABLE IF NOT EXISTS "ref_cup_network" (
    "id" TEXT NOT NULL,
    "hmain_cup" VARCHAR(10) NOT NULL,
    "hmain_cup_name" VARCHAR(255),
    "pcu_hcode" VARCHAR(10) NOT NULL,
    "pcu_name" VARCHAR(255),
    "province" VARCHAR(100),
    "region" VARCHAR(100),
    CONSTRAINT "ref_cup_network_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ref_cup_network_hmain_cup_pcu_hcode_key" ON "ref_cup_network"("hmain_cup", "pcu_hcode");
CREATE INDEX IF NOT EXISTS "ref_cup_network_hmain_cup_idx" ON "ref_cup_network"("hmain_cup");
CREATE INDEX IF NOT EXISTS "ref_cup_network_pcu_hcode_idx" ON "ref_cup_network"("pcu_hcode");

-- CreateTable: ref_health_office
CREATE TABLE IF NOT EXISTS "ref_health_office" (
    "hcode" VARCHAR(10) NOT NULL,
    "name" VARCHAR(255),
    "org_type" VARCHAR(100),
    "unit_type" VARCHAR(150),
    "affiliation" VARCHAR(150),
    "hosp_level" VARCHAR(100),
    "active_status" VARCHAR(100),
    "province_code" VARCHAR(10),
    "province_name" VARCHAR(100),
    "amphur_code" VARCHAR(10),
    CONSTRAINT "ref_health_office_pkey" PRIMARY KEY ("hcode")
);

CREATE INDEX IF NOT EXISTS "ref_health_office_hosp_level_idx" ON "ref_health_office"("hosp_level");
CREATE INDEX IF NOT EXISTS "ref_health_office_affiliation_idx" ON "ref_health_office"("affiliation");
