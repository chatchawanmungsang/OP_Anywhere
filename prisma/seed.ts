import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const DEFAULT_REMARK_RULES = [
  {
    code: "R01_SAME_UNIT",
    name: "หน่วยบริการที่รักษาเป็นหน่วยเดียวกับหน่วยประจำ/ปฐมภูมิ",
    description:
      "คัดออกกรณี HCODE ตรงกับหน่วยบริการประจำ (HMAIN2) หรือหน่วยบริการปฐมภูมิประจำตัวผู้ป่วย (HSUB_AF)",
    remarkText:
      "คัดออก: หน่วยบริการที่รักษาเป็นหน่วยเดียวกับหน่วยประจำ/ปฐมภูมิของผู้ป่วย (HCODE = HMAIN2 หรือ HSUB_AF)",
    outcome: "PRUNED_OUT",
    priority: 10,
    active: true,
    conditionMode: "SQL",
    conditionsJson: null,
    sqlWhere:
      "(LPAD(TRIM(COALESCE(s.hcode, '')), 5, '0') = LPAD(TRIM(COALESCE(s.hmain2, '')), 5, '0') OR LPAD(TRIM(COALESCE(s.hcode, '')), 5, '0') = LPAD(TRIM(COALESCE(s.hsub_af, '')), 5, '0'))",
  },
  {
    code: "R02_SAME_CUP_NETWORK",
    name: "หน่วยบริการที่รักษาอยู่ในเครือข่ายปฐมภูมิ (CUP) เดียวกับ HMAIN2",
    description:
      "จากการวิเคราะห์ Orange Data Mining พบความแม่นยำในการคัดออก 99.85% เมื่อ HCODE อยู่ในเครือข่ายปฐมภูมิของ HMAIN2 ตามตารางเครือข่ายหน่วยบริการ",
    remarkText:
      "คัดออก: หน่วยบริการที่รักษาอยู่ในเครือข่าย CUP เดียวกับหน่วยบริการประจำของผู้ป่วย (Walk-in ในเครือข่ายตนเอง)",
    outcome: "PRUNED_OUT",
    priority: 20,
    active: true,
    conditionMode: "BUILDER",
    conditionsJson: [
      { field: "in_same_cup_network", operator: "EQ", value: "Y" },
    ],
    sqlWhere: "(net.pcu_hcode IS NOT NULL)",
  },
  {
    code: "R03_EXCLUDED_SUBFUND",
    name: "กองทุนหลัก/กองทุนย่อยควบคู่ที่ไม่เข้าเกณฑ์จ่ายชุด OP Walk-in",
    description:
      "คัดออก 100% ในกลุ่มกองทุนผสม DM22,HC16 / HC09,HC16 / HC16,HC22 หรือกองทุนย่อยที่มี HERB หรือ OPINST ควบคู่",
    remarkText:
      "คัดออก: รหัสกองทุนหรือกองทุนย่อยควบคู่ไม่เข้าเกณฑ์ (HERB / OPINST / HC22 / HC09 / DM22)",
    outcome: "PRUNED_OUT",
    priority: 30,
    active: true,
    conditionMode: "SQL",
    conditionsJson: null,
    sqlWhere:
      "(s.fund_af IN ('DM22,HC16', 'HC09,HC16', 'HC16,HC22') OR COALESCE(s.sub_fund, '') ILIKE '%HERB%' OR COALESCE(s.sub_fund, '') ILIKE '%OPINST%')",
  },
  {
    code: "R04_LOW_COST_A_S_DELAY",
    name: "ยอดเบิกไม่เกิน 50 บาท ในกลุ่มแม่ข่ายระดับ A/S ที่ส่งข้อมูลล่าช้าเกิน 3 วัน",
    description:
      "คัดออกกรณี CHARGE_COST <= 50 บาท ในโรงพยาบาลระดับ A หรือ S ที่ส่งข้อมูลหลังวันรับบริการเกิน 3 วัน (Precision ~95-98%)",
    remarkText:
      "คัดออก: ยอดเบิกไม่เกิน 50 บาท ในกลุ่มหน่วยบริการระดับ A/S และส่งข้อมูลล่าช้าเกินเกณฑ์ (> 3 วัน)",
    outcome: "PRUNED_OUT",
    priority: 40,
    active: true,
    conditionMode: "BUILDER",
    conditionsJson: [
      { field: "charge_cost", operator: "LTE", value: "50" },
      { field: "hosp_level_prefix", operator: "IN", value: "A,S" },
      { field: "send_delay_days", operator: "GT", value: "3" },
    ],
    sqlWhere:
      "(COALESCE(s.charge_cost, 0) <= 50 AND (COALESCE(ho.hosp_level, '') LIKE 'A%' OR COALESCE(ho.hosp_level, '') LIKE 'S%') AND (CASE WHEN s.date_send IS NOT NULL AND s.date_send > 20000 AND s.dateadm ~ '^[0-9]{8}$' THEN ((DATE '1899-12-30' + FLOOR(s.date_send)::int) - TO_DATE(((SUBSTRING(s.dateadm, 1, 4)::int - 543)::text || SUBSTRING(s.dateadm, 5, 4)), 'YYYYMMDD')) ELSE 0 END) > 3)",
  },
  {
    code: "R05_LEVEL_S_LOW_SEV12",
    name: "รพท.ระดับ S ยอดเบิก > 50 บาท แต่หมวดค่าบริการผู้ป่วยนอก (SEV12) <= 40 บาท",
    description:
      "กฎจาก Decision Tree สำหรับหน่วยบริการระดับ S ที่มี CHARGE_COST > 50 แต่ยอดหมวด 12 ไม่เกิน 40 บาท (Precision 99.15%)",
    remarkText:
      "คัดออก: หน่วยบริการระดับ S เข้าเงื่อนไขยอดหมวดบริการผู้ป่วยนอก (SEV12 <= 40)",
    outcome: "PRUNED_OUT",
    priority: 50,
    active: true,
    conditionMode: "BUILDER",
    conditionsJson: [
      { field: "charge_cost", operator: "GT", value: "50" },
      { field: "hosp_level_prefix", operator: "EQ", value: "S" },
      { field: "sev12", operator: "LTE", value: "40" },
    ],
    sqlWhere:
      "(COALESCE(s.charge_cost, 0) > 50 AND COALESCE(ho.hosp_level, '') LIKE 'S%' AND COALESCE(s.sev12, 0) <= 40)",
  },
];

async function seedReferenceTables() {
  const refDir = path.join(process.cwd(), "prisma", "reference-data");

  // 1. Seed CUP Network
  const cupPath = path.join(refDir, "cup_network.json");
  if (fs.existsSync(cupPath)) {
    const existingCup = await prisma.refCupNetwork.count();
    if (existingCup === 0) {
      const cupRows = JSON.parse(fs.readFileSync(cupPath, "utf8"));
      await prisma.refCupNetwork.createMany({
        data: cupRows,
        skipDuplicates: true,
      });
      console.log(`Seeded ref_cup_network: ${cupRows.length} rows`);
    }
  }

  // 2. Seed / refresh Health Office (including แผนก/กรม)
  const hoPath = path.join(refDir, "health_office.json");
  if (fs.existsSync(hoPath)) {
    const hoRows = JSON.parse(fs.readFileSync(hoPath, "utf8")) as Array<{
      hcode: string;
      name?: string;
      orgType?: string;
      unitType?: string;
      affiliation?: string;
      department?: string;
      hospLevel?: string;
      activeStatus?: string;
      provinceCode?: string;
      provinceName?: string;
      amphurCode?: string;
    }>;
    const existingHo = await prisma.refHealthOffice.count();
    const hasDepartment =
      existingHo > 0
        ? (await prisma.refHealthOffice.count({
            where: { department: { not: null } },
          })) > 0
        : false;

    if (existingHo === 0 || !hasDepartment) {
      if (existingHo > 0) {
        await prisma.refHealthOffice.deleteMany();
        console.log("Cleared ref_health_office to reload with department");
      }
      const chunkSize = 2500;
      for (let i = 0; i < hoRows.length; i += chunkSize) {
        const chunk = hoRows.slice(i, i + chunkSize);
        await prisma.refHealthOffice.createMany({
          data: chunk,
          skipDuplicates: true,
        });
      }
      console.log(`Seeded ref_health_office: ${hoRows.length} rows`);
    }
  }

  // 3. Seed Default Remark Rules (only insert missing rule codes so user edits are preserved)
  for (const rule of DEFAULT_REMARK_RULES) {
    await prisma.remarkRule.upsert({
      where: { code: rule.code },
      update: {},
      create: {
        code: rule.code,
        name: rule.name,
        description: rule.description,
        remarkText: rule.remarkText,
        outcome: rule.outcome,
        priority: rule.priority,
        active: rule.active,
        conditionMode: rule.conditionMode,
        conditionsJson: rule.conditionsJson ?? undefined,
        sqlWhere: rule.sqlWhere,
      },
    });
  }
  console.log(`Verified default remark_rules (${DEFAULT_REMARK_RULES.length} base rules)`);
}

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 12);

  await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      name: "Admin",
      passwordHash,
      role: Role.ADMIN,
      active: true,
    },
  });

  console.log("Seeded admin user: admin@example.com / admin123");
  await seedReferenceTables();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
