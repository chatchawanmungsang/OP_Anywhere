import "server-only";
import { prisma } from "@/lib/prisma";
import type { BuilderCondition, BuilderOperator } from "@/lib/remark-types";

const SEND_DELAY_SQL_EXPR = `(CASE WHEN s.date_send IS NOT NULL AND s.date_send > 20000 AND s.dateadm ~ '^[0-9]{8}$' THEN ((DATE '1899-12-30' + FLOOR(s.date_send)::int) - TO_DATE(((SUBSTRING(s.dateadm, 1, 4)::int - 543)::text || SUBSTRING(s.dateadm, 5, 4)), 'YYYYMMDD')) ELSE 0 END)`;

function sqlLiteralString(raw: string): string {
  return `'${raw.replace(/'/g, "''")}'`;
}

function sqlLiteralNumber(raw: string): string {
  const num = Number(raw.trim());
  if (!Number.isFinite(num)) {
    throw new Error(`ค่าตัวเลขไม่ถูกต้อง: "${raw}"`);
  }
  return String(num);
}

function pad5IfDigits(raw: string): string {
  const s = raw.trim();
  return /^\d{1,5}$/.test(s) ? s.padStart(5, "0") : s;
}

function compileSingleCondition(cond: BuilderCondition): string {
  const field = cond.field.trim();
  const op: BuilderOperator = cond.operator;
  const rawVal = String(cond.value ?? "").trim();

  if (!rawVal) {
    throw new Error(`กรุณาระบุค่าของเงื่อนไขฟิลด์ ${field}`);
  }

  // Special boolean derived fields
  if (field === "in_same_cup_network") {
    const yn = rawVal.toUpperCase() === "N" ? "N" : "Y";
    const wantSame = (yn === "Y" && op !== "NEQ") || (yn === "N" && op === "NEQ");
    return wantSame ? "(net.pcu_hcode IS NOT NULL)" : "(net.pcu_hcode IS NULL)";
  }

  if (field === "is_hcode_eq_hmain2") {
    const yn = rawVal.toUpperCase() === "N" ? "N" : "Y";
    const wantEq = (yn === "Y" && op !== "NEQ") || (yn === "N" && op === "NEQ");
    return wantEq
      ? "(LPAD(TRIM(COALESCE(s.hcode, '')), 5, '0') = LPAD(TRIM(COALESCE(s.hmain2, '')), 5, '0'))"
      : "(LPAD(TRIM(COALESCE(s.hcode, '')), 5, '0') <> LPAD(TRIM(COALESCE(s.hmain2, '')), 5, '0'))";
  }

  if (field === "is_hcode_eq_hsub") {
    const yn = rawVal.toUpperCase() === "N" ? "N" : "Y";
    const wantEq = (yn === "Y" && op !== "NEQ") || (yn === "N" && op === "NEQ");
    return wantEq
      ? "(LPAD(TRIM(COALESCE(s.hcode, '')), 5, '0') = LPAD(TRIM(COALESCE(s.hsub_af, '')), 5, '0'))"
      : "(LPAD(TRIM(COALESCE(s.hcode, '')), 5, '0') <> LPAD(TRIM(COALESCE(s.hsub_af, '')), 5, '0'))";
  }

  if (field === "hosp_level_prefix") {
    const prefixes = rawVal
      .split(",")
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean);
    if (prefixes.length === 0) {
      throw new Error("กรุณาระบุระดับโรงพยาบาล เช่น A,S");
    }
    const parts = prefixes.map(
      (p) => `COALESCE(ho.hosp_level, '') ILIKE ${sqlLiteralString(`${p}%`)}`,
    );
    if (op === "NEQ" || op === "NOT_IN" || op === "NOT_CONTAINS") {
      return `(NOT (${parts.join(" OR ")}))`;
    }
    return `(${parts.join(" OR ")})`;
  }

  // Numeric fields
  const numericExprMap: Record<string, string> = {
    charge_cost: "COALESCE(s.charge_cost, 0)",
    sums_cost: "COALESCE(s.sums_cost, 0)",
    send_delay_days: SEND_DELAY_SQL_EXPR,
    age_yy: "COALESCE(s.age_yy, 0)",
    status_cardb: "COALESCE(s.status_cardb, 0)",
    sev04: "COALESCE(s.sev04, 0)",
    sev12: "COALESCE(s.sev12, 0)",
  };

  if (field in numericExprMap) {
    const expr = numericExprMap[field]!;
    if (op === "IN" || op === "NOT_IN") {
      const nums = rawVal
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .map(sqlLiteralNumber);
      if (nums.length === 0) throw new Error(`กรุณาระบุชุดตัวเลขสำหรับ ${field}`);
      return `(${expr} ${op === "NOT_IN" ? "NOT IN" : "IN"} (${nums.join(", ")}))`;
    }
    const numLit = sqlLiteralNumber(rawVal);
    switch (op) {
      case "EQ":
        return `(${expr} = ${numLit})`;
      case "NEQ":
        return `(${expr} <> ${numLit})`;
      case "GT":
        return `(${expr} > ${numLit})`;
      case "GTE":
        return `(${expr} >= ${numLit})`;
      case "LT":
        return `(${expr} < ${numLit})`;
      case "LTE":
        return `(${expr} <= ${numLit})`;
      default:
        return `(${expr} = ${numLit})`;
    }
  }

  // HCODE 5-digit padded string fields
  const paddedCodeFields: Record<string, string> = {
    hcode: "LPAD(TRIM(COALESCE(s.hcode, '')), 5, '0')",
    hmain2: "LPAD(TRIM(COALESCE(s.hmain2, '')), 5, '0')",
    hsub_af: "LPAD(TRIM(COALESCE(s.hsub_af, '')), 5, '0')",
    hcode_paid: "LPAD(TRIM(COALESCE(s.hcode_paid, '')), 5, '0')",
  };

  // Standard string fields
  const stringExprMap: Record<string, string> = {
    ...paddedCodeFields,
    htype: "COALESCE(s.htype, '')",
    ho_affiliation: "COALESCE(ho.affiliation, '')",
    fund_af: "COALESCE(s.fund_af, '')",
    sub_fund: "COALESCE(s.sub_fund, '')",
    maininscl_af: "COALESCE(s.maininscl_af, '')",
    subinscl_af: "COALESCE(s.subinscl_af, '')",
    pdx: "COALESCE(s.pdx, '')",
    aen: "COALESCE(s.aen, '')",
    projectcode: "COALESCE(s.projectcode, '')",
    stmt_period: "COALESCE(s.stmt_period, '')",
  };

  const expr = stringExprMap[field];
  if (!expr) {
    throw new Error(`ไม่รู้จักฟิลด์เงื่อนไข: ${field}`);
  }

  const isPadded = field in paddedCodeFields;
  const normalizeItem = (v: string) => (isPadded ? pad5IfDigits(v) : v.trim());

  switch (op) {
    case "EQ":
      return `(${expr} = ${sqlLiteralString(normalizeItem(rawVal))})`;
    case "NEQ":
      return `(${expr} <> ${sqlLiteralString(normalizeItem(rawVal))})`;
    case "CONTAINS":
      return `(${expr} ILIKE ${sqlLiteralString(`%${rawVal}%`)})`;
    case "NOT_CONTAINS":
      return `(${expr} NOT ILIKE ${sqlLiteralString(`%${rawVal}%`)})`;
    case "STARTS_WITH":
      return `(${expr} ILIKE ${sqlLiteralString(`${rawVal}%`)})`;
    case "IN":
    case "NOT_IN": {
      const items = rawVal
        .split(",")
        .map((x) => normalizeItem(x))
        .filter(Boolean)
        .map(sqlLiteralString);
      if (items.length === 0) throw new Error(`กรุณาระบุค่าสำหรับ ${field}`);
      return `(${expr} ${op === "NOT_IN" ? "NOT IN" : "IN"} (${items.join(", ")}))`;
    }
    default:
      return `(${expr} = ${sqlLiteralString(normalizeItem(rawVal))})`;
  }
}

export function compileBuilderConditionsToSql(
  conditions: BuilderCondition[],
): string {
  if (!Array.isArray(conditions) || conditions.length === 0) {
    throw new Error("กรุณากำหนดเงื่อนไขอย่างน้อย 1 ข้อ");
  }
  const parts = conditions.map(compileSingleCondition);
  return `(${parts.join(" AND ")})`;
}

const FORBIDDEN_SQL_TOKENS =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|GRANT|REVOKE|CREATE|EXEC|EXECUTE|COPY|PG_SLEEP|PG_READ_FILE|INFORMATION_SCHEMA|PG_CATALOG)\b|;|--|\/\*/i;

export async function validateRuleSqlWhere(sqlWhere: string): Promise<void> {
  const trimmed = sqlWhere.trim();
  if (!trimmed) {
    throw new Error("เงื่อนไข SQL ห้ามว่าง");
  }
  if (FORBIDDEN_SQL_TOKENS.test(trimmed)) {
    throw new Error(
      "ไม่อนุญาตให้ใช้คำสั่งเปลี่ยนแปลงโครงสร้างฐานข้อมูลหรือเครื่องหมาย ; / -- ในเงื่อนไข SQL",
    );
  }

  // Dry-run validate with PostgreSQL planner against aliases s, ho, net
  const testQuery = `
    SELECT s.id
    FROM "eclaim_transaction_summary" s
    LEFT JOIN "ref_health_office" ho
      ON LPAD(TRIM(COALESCE(s.hcode, '')), 5, '0') = ho.hcode
    LEFT JOIN "ref_cup_network" net
      ON LPAD(TRIM(COALESCE(s.hmain2, '')), 5, '0') = net.hmain_cup
     AND LPAD(TRIM(COALESCE(s.hcode, '')), 5, '0') = net.pcu_hcode
    WHERE (${trimmed})
    LIMIT 0
  `;
  try {
    await prisma.$queryRawUnsafe(testQuery);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`เงื่อนไข SQL ไม่ถูกต้อง: ${msg}`);
  }
}

export type RunRemarkInput = {
  yearThai: number;
  monthThai: number;
  /** 1 or 2 for specific period, or 0 for all periods in that month */
  period: number;
};

export type RuleExecutionHit = {
  ruleCode: string;
  ruleName: string;
  outcome: string;
  matchedRows: number;
};

export type RunRemarkSummary = {
  totalProcessed: number;
  passCount: number;
  prunedOutCount: number;
  passChargeSum: number;
  prunedOutChargeSum: number;
  ruleBreakdown: RuleExecutionHit[];
  elapsedMs: number;
};

export async function executeRemarkRulesForPeriod(
  input: RunRemarkInput,
): Promise<RunRemarkSummary> {
  const t0 = Date.now();
  const year = Math.trunc(input.yearThai);
  const month = Math.trunc(input.monthThai);
  const period = Math.trunc(input.period);

  const activeRules = await prisma.remarkRule.findMany({
    where: { active: true },
    orderBy: [{ priority: "asc" }, { code: "asc" }],
  });

  // Validate active rules before starting transaction
  for (const r of activeRules) {
    if (FORBIDDEN_SQL_TOKENS.test(r.sqlWhere)) {
      throw new Error(`กฎ ${r.code} มีนิพจน์ที่ไม่อนุญาต`);
    }
  }

  const periodFilterSql =
    period === 1 || period === 2
      ? `s.import_year_thai = ${year} AND s.import_month_thai = ${month} AND s.import_period = ${period}`
      : `s.import_year_thai = ${year} AND s.import_month_thai = ${month}`;

  const ruleBreakdown: RuleExecutionHit[] = [];
  let totalProcessed = 0;

  await prisma.$transaction(
    async (tx) => {
      // 1. Reset all rows in selected scope to pending (NULL) so rules evaluate cleanly by priority
      const resetSql = `
        UPDATE "eclaim_transaction_summary" s
        SET remark_status = NULL,
            remark_rule_code = NULL,
            remark_note = NULL,
            remarked_at = NOW()
        WHERE ${periodFilterSql}
      `;
      totalProcessed = await tx.$executeRawUnsafe(resetSql);

      if (totalProcessed === 0) {
        return;
      }

      // 2. Apply each active rule in ascending priority order on rows not yet decided
      for (const rule of activeRules) {
        const outcome = rule.outcome === "PASS" ? "PASS" : "PRUNED_OUT";
        const updateRuleSql = `
          WITH matched AS (
            SELECT s.id
            FROM "eclaim_transaction_summary" s
            LEFT JOIN "ref_health_office" ho
              ON LPAD(TRIM(COALESCE(s.hcode, '')), 5, '0') = ho.hcode
            LEFT JOIN "ref_cup_network" net
              ON LPAD(TRIM(COALESCE(s.hmain2, '')), 5, '0') = net.hmain_cup
             AND LPAD(TRIM(COALESCE(s.hcode, '')), 5, '0') = net.pcu_hcode
            WHERE ${periodFilterSql}
              AND s.remark_status IS NULL
              AND (${rule.sqlWhere})
          )
          UPDATE "eclaim_transaction_summary" target
          SET remark_status = $1,
              remark_rule_code = $2,
              remark_note = $3,
              remarked_at = NOW()
          FROM matched
          WHERE target.id = matched.id
        `;
        const hitCount = await tx.$executeRawUnsafe(
          updateRuleSql,
          outcome,
          rule.code,
          rule.remarkText,
        );
        ruleBreakdown.push({
          ruleCode: rule.code,
          ruleName: rule.name,
          outcome,
          matchedRows: Number(hitCount),
        });
      }

      // 3. Remaining undecided rows pass default screening
      const defaultPassSql = `
        UPDATE "eclaim_transaction_summary" s
        SET remark_status = 'PASS',
            remark_rule_code = 'PASS_DEFAULT',
            remark_note = 'ผ่านเกณฑ์การคัดกรองเบื้องต้น',
            remarked_at = NOW()
        WHERE ${periodFilterSql}
          AND s.remark_status IS NULL
      `;
      await tx.$executeRawUnsafe(defaultPassSql);
    },
    { timeout: 120_000, maxWait: 15_000 },
  );

  // Aggregate final stats
  const whereClause = {
    importYearThai: year,
    importMonthThai: month,
    ...(period === 1 || period === 2 ? { importPeriod: period } : {}),
  };

  const grouped = await prisma.eclaimTransactionSummary.groupBy({
    by: ["remarkStatus"],
    where: whereClause,
    _count: { _all: true },
    _sum: { chargeCost: true },
  });

  let passCount = 0;
  let prunedOutCount = 0;
  let passChargeSum = 0;
  let prunedOutChargeSum = 0;

  for (const g of grouped) {
    const cnt = g._count._all;
    const sumVal = g._sum.chargeCost ? Number(g._sum.chargeCost.toString()) : 0;
    if (g.remarkStatus === "PASS") {
      passCount += cnt;
      passChargeSum += sumVal;
    } else if (g.remarkStatus === "PRUNED_OUT") {
      prunedOutCount += cnt;
      prunedOutChargeSum += sumVal;
    }
  }

  return {
    totalProcessed,
    passCount,
    prunedOutCount,
    passChargeSum,
    prunedOutChargeSum,
    ruleBreakdown,
    elapsedMs: Date.now() - t0,
  };
}
