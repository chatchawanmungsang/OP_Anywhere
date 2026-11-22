-- AlterTable User: unit for Manager role
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hcode" VARCHAR(10);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hname" VARCHAR(255);

-- AlterTable ref_health_office: แผนก/กรม
ALTER TABLE "ref_health_office" ADD COLUMN IF NOT EXISTS "department" VARCHAR(255);
CREATE INDEX IF NOT EXISTS "ref_health_office_department_idx" ON "ref_health_office"("department");
