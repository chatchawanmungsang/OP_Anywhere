import "server-only";

import { prisma } from "@/lib/prisma";
import { THAI_MONTHS } from "@/lib/import-metadata";
import type {
  AffiliationGroup,
  CrosstabResult,
  CrosstabRow,
  DashboardPayload,
  DeptSubGroup,
  MetricDelta,
  MonthOption,
  MonthPeriodStats,
  ReportKind,
} from "@/lib/report-types";

export type {
  AffiliationGroup,
  CrosstabResult,
  CrosstabRow,
  DashboardPayload,
  DeptSubGroup,
  MetricDelta,
  MonthOption,
  MonthPeriodStats,
  ReportKind,
} from "@/lib/report-types";

export const MOPH_AFFILIATION = "กระทรวงสาธารณสุข";

export async function listAvailableSummaryMonths(): Promise<MonthOption[]> {
  const groups = await prisma.eclaimTransactionSummary.groupBy({
    by: ["importYearThai", "importMonthThai"],
    orderBy: [{ importYearThai: "desc" }, { importMonthThai: "desc" }],
  });

  return groups.map((g) => {
    const monthLabel =
      THAI_MONTHS.find((m) => m.value === g.importMonthThai)?.label ??
      String(g.importMonthThai);
    return {
      yearThai: g.importYearThai,
      monthThai: g.importMonthThai,
      label: `${monthLabel} ${g.importYearThai}`,
    };
  });
}

export function formatExportFileBase(yearThai: number, monthThai: number): string {
  const monthLabel =
    THAI_MONTHS.find((m) => m.value === monthThai)?.label ??
    String(monthThai).padStart(2, "0");
  return `OP_${monthLabel}_${yearThai}`;
}

function emptyTotals() {
  return {
    p1TranCount: 0,
    p1ChargeCost: 0,
    p2TranCount: 0,
    p2ChargeCost: 0,
    monthTranCount: 0,
    monthChargeCost: 0,
    compensation: 0,
    unitCount: 0,
  };
}

function buildGroups(mapped: CrosstabRow[]): CrosstabResult {
  const groupMap = new Map<string, AffiliationGroup>();

  for (const row of mapped) {
    let group = groupMap.get(row.affiliation);
    if (!group) {
      group = {
        affiliation: row.affiliation,
        rows: [],
        departments: [],
        p1TranCount: 0,
        p1ChargeCost: 0,
        p2TranCount: 0,
        p2ChargeCost: 0,
        monthTranCount: 0,
        monthChargeCost: 0,
        compensation: 0,
      };
      groupMap.set(row.affiliation, group);
    }
    group.rows.push(row);
    group.p1TranCount += row.p1TranCount;
    group.p1ChargeCost += row.p1ChargeCost;
    group.p2TranCount += row.p2TranCount;
    group.p2ChargeCost += row.p2ChargeCost;
    group.monthTranCount += row.monthTranCount;
    group.monthChargeCost += row.monthChargeCost;
    group.compensation += row.compensation;
  }

  for (const group of groupMap.values()) {
    if (group.affiliation === MOPH_AFFILIATION) {
      const deptMap = new Map<string, DeptSubGroup>();
      for (const row of group.rows) {
        const deptName = row.department?.trim() || "ไม่ระบุแผนก/กรม";
        let dept = deptMap.get(deptName);
        if (!dept) {
          dept = {
            department: deptName,
            rows: [],
            p1TranCount: 0,
            p1ChargeCost: 0,
            p2TranCount: 0,
            p2ChargeCost: 0,
            monthTranCount: 0,
            monthChargeCost: 0,
            compensation: 0,
          };
          deptMap.set(deptName, dept);
        }
        dept.rows.push(row);
        dept.p1TranCount += row.p1TranCount;
        dept.p1ChargeCost += row.p1ChargeCost;
        dept.p2TranCount += row.p2TranCount;
        dept.p2ChargeCost += row.p2ChargeCost;
        dept.monthTranCount += row.monthTranCount;
        dept.monthChargeCost += row.monthChargeCost;
        dept.compensation += row.compensation;
      }
      group.departments = Array.from(deptMap.values()).sort((a, b) =>
        a.department.localeCompare(b.department, "th"),
      );
    } else {
      group.departments = [];
    }
  }

  const groups = Array.from(groupMap.values()).sort((a, b) =>
    a.affiliation.localeCompare(b.affiliation, "th"),
  );

  const totals = groups.reduce(
    (acc, g) => ({
      p1TranCount: acc.p1TranCount + g.p1TranCount,
      p1ChargeCost: acc.p1ChargeCost + g.p1ChargeCost,
      p2TranCount: acc.p2TranCount + g.p2TranCount,
      p2ChargeCost: acc.p2ChargeCost + g.p2ChargeCost,
      monthTranCount: acc.monthTranCount + g.monthTranCount,
      monthChargeCost: acc.monthChargeCost + g.monthChargeCost,
      compensation: acc.compensation + g.compensation,
      unitCount: acc.unitCount + g.rows.length,
    }),
    emptyTotals(),
  );

  return { groups, totals };
}

type RawRow = {
  code: string | null;
  name: string | null;
  affiliation: string | null;
  department: string | null;
  p1_tran_count: bigint;
  p1_charge_cost: string | number | null;
  p2_tran_count: bigint;
  p2_charge_cost: string | number | null;
};

function mapRaw(rows: RawRow[]): CrosstabRow[] {
  return rows.map((r) => {
    const p1TranCount = Number(r.p1_tran_count);
    const p1ChargeCost = Number(r.p1_charge_cost ?? 0);
    const p2TranCount = Number(r.p2_tran_count);
    const p2ChargeCost = Number(r.p2_charge_cost ?? 0);
    return {
      code: r.code || "(ว่าง)",
      name: r.name || "—",
      affiliation: r.affiliation || "ไม่ระบุต้นสังกัด",
      department: r.department?.trim() || null,
      p1TranCount,
      p1ChargeCost,
      p2TranCount,
      p2ChargeCost,
      monthTranCount: p1TranCount + p2TranCount,
      monthChargeCost: p1ChargeCost + p2ChargeCost,
      compensation: 0,
    };
  });
}

/** สรุปตามหน่วยที่รักษา (HCODE / HNAME) */
export async function getHcodeCrosstabForMonth(
  yearThai: number,
  monthThai: number,
): Promise<CrosstabResult> {
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT
      COALESCE(s.hcode, '') AS code,
      COALESCE(MAX(s.hname), '') AS name,
      COALESCE(NULLIF(TRIM(ho.affiliation), ''), 'ไม่ระบุต้นสังกัด') AS affiliation,
      NULLIF(TRIM(MAX(ho.department)), '') AS department,
      COUNT(*) FILTER (WHERE s.import_period = 1)::bigint AS p1_tran_count,
      COALESCE(SUM(s.charge_cost) FILTER (WHERE s.import_period = 1), 0) AS p1_charge_cost,
      COUNT(*) FILTER (WHERE s.import_period = 2)::bigint AS p2_tran_count,
      COALESCE(SUM(s.charge_cost) FILTER (WHERE s.import_period = 2), 0) AS p2_charge_cost
    FROM eclaim_transaction_summary s
    LEFT JOIN ref_health_office ho
      ON LPAD(TRIM(COALESCE(s.hcode, '')), 5, '0') = LPAD(TRIM(ho.hcode), 5, '0')
    WHERE s.import_year_thai = ${yearThai}
      AND s.import_month_thai = ${monthThai}
    GROUP BY
      COALESCE(s.hcode, ''),
      COALESCE(NULLIF(TRIM(ho.affiliation), ''), 'ไม่ระบุต้นสังกัด'),
      NULLIF(TRIM(ho.department), '')
    ORDER BY affiliation, COALESCE(s.hcode, '')
  `;
  return buildGroups(mapRaw(rows));
}

/** สรุปตามหน่วยบริการประจำ (HMAIN2 / HNAME2) */
export async function getHmainCrosstabForMonth(
  yearThai: number,
  monthThai: number,
): Promise<CrosstabResult> {
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT
      COALESCE(s.hmain2, '') AS code,
      COALESCE(MAX(s.hname2), '') AS name,
      COALESCE(NULLIF(TRIM(ho.affiliation), ''), 'ไม่ระบุต้นสังกัด') AS affiliation,
      NULLIF(TRIM(MAX(ho.department)), '') AS department,
      COUNT(*) FILTER (WHERE s.import_period = 1)::bigint AS p1_tran_count,
      COALESCE(SUM(s.charge_cost) FILTER (WHERE s.import_period = 1), 0) AS p1_charge_cost,
      COUNT(*) FILTER (WHERE s.import_period = 2)::bigint AS p2_tran_count,
      COALESCE(SUM(s.charge_cost) FILTER (WHERE s.import_period = 2), 0) AS p2_charge_cost
    FROM eclaim_transaction_summary s
    LEFT JOIN ref_health_office ho
      ON LPAD(TRIM(COALESCE(s.hmain2, '')), 5, '0') = LPAD(TRIM(ho.hcode), 5, '0')
    WHERE s.import_year_thai = ${yearThai}
      AND s.import_month_thai = ${monthThai}
    GROUP BY
      COALESCE(s.hmain2, ''),
      COALESCE(NULLIF(TRIM(ho.affiliation), ''), 'ไม่ระบุต้นสังกัด'),
      NULLIF(TRIM(ho.department), '')
    ORDER BY affiliation, COALESCE(s.hmain2, '')
  `;
  return buildGroups(mapRaw(rows));
}

/** รายงานการจ่ายรายเดือน — รวมเดือนเท่านั้น + จำนวนเงินชดเชย */
export async function getPaymentCrosstabForMonth(
  yearThai: number,
  monthThai: number,
): Promise<CrosstabResult> {
  const result = await getHcodeCrosstabForMonth(yearThai, monthThai);
  return result;
}

export async function getReportCrosstab(
  kind: ReportKind,
  yearThai: number,
  monthThai: number,
): Promise<CrosstabResult> {
  if (kind === "hmain") return getHmainCrosstabForMonth(yearThai, monthThai);
  if (kind === "payment") return getPaymentCrosstabForMonth(yearThai, monthThai);
  return getHcodeCrosstabForMonth(yearThai, monthThai);
}

/** Flatten for export */
export function flattenCrosstabForExport(
  kind: ReportKind,
  result: CrosstabResult,
): Record<string, string | number>[] {
  const out: Record<string, string | number>[] = [];
  for (const g of result.groups) {
    const emitRow = (r: CrosstabRow, dept: string) => {
      if (kind === "payment") {
        out.push({
          ต้นสังกัด: g.affiliation,
          "แผนก/กรม": dept,
          รหัส: r.code,
          ชื่อหน่วยรักษา: r.name,
          Visit: r.monthTranCount,
          "ค่าบริการ(บาท)": Number(r.monthChargeCost.toFixed(2)),
          "จำนวนเงินชดเชย(บาท)": Number(r.compensation.toFixed(2)),
        });
      } else {
        out.push({
          ต้นสังกัด: g.affiliation,
          "แผนก/กรม": dept,
          รหัส: r.code,
          [kind === "hmain" ? "หน่วยบริการประจำ" : "ชื่อหน่วยรักษา"]: r.name,
          "Visit งวด1": r.p1TranCount,
          "ค่าบริการ(บาท) งวด1": Number(r.p1ChargeCost.toFixed(2)),
          "Visit งวด2": r.p2TranCount,
          "ค่าบริการ(บาท) งวด2": Number(r.p2ChargeCost.toFixed(2)),
          "Visit รวมเดือน": r.monthTranCount,
          "ค่าบริการ(บาท) รวมเดือน": Number(r.monthChargeCost.toFixed(2)),
        });
      }
    };

    if (g.affiliation === MOPH_AFFILIATION && g.departments.length > 0) {
      for (const d of g.departments) {
        for (const r of d.rows) emitRow(r, d.department);
      }
    } else {
      for (const r of g.rows) emitRow(r, "");
    }
  }
  return out;
}

function prevYearMonth(year: number, month: number): { year: number; month: number } {
  if (month <= 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function metricDelta(current: number, previous: number | null): MetricDelta {
  if (previous == null) {
    return {
      current,
      previous: 0,
      diff: current,
      pct: null,
      direction: current === 0 ? "flat" : "new",
    };
  }
  const diff = current - previous;
  const pct = previous === 0 ? (current === 0 ? 0 : null) : (diff / previous) * 100;
  const direction =
    Math.abs(diff) < 1e-9 ? "flat" : diff > 0 ? "up" : "down";
  return { current, previous, diff, pct, direction };
}

async function loadMonthPeriodStats(
  yearThai: number,
  monthThai: number,
): Promise<MonthPeriodStats> {
  const monthLabel =
    THAI_MONTHS.find((m) => m.value === monthThai)?.label ?? String(monthThai);

  const agg = await prisma.$queryRaw<
    {
      p1_visits: bigint;
      p2_visits: bigint;
      p1_charge: string | number | null;
      p2_charge: string | number | null;
      unit_count: bigint;
    }[]
  >`
    SELECT
      COUNT(*) FILTER (WHERE import_period = 1)::bigint AS p1_visits,
      COUNT(*) FILTER (WHERE import_period = 2)::bigint AS p2_visits,
      COALESCE(SUM(charge_cost) FILTER (WHERE import_period = 1), 0) AS p1_charge,
      COALESCE(SUM(charge_cost) FILTER (WHERE import_period = 2), 0) AS p2_charge,
      COUNT(DISTINCT NULLIF(TRIM(hcode), ''))::bigint AS unit_count
    FROM eclaim_transaction_summary
    WHERE import_year_thai = ${yearThai}
      AND import_month_thai = ${monthThai}
  `;

  const row = agg[0];
  const p1Visits = Number(row?.p1_visits ?? 0);
  const p2Visits = Number(row?.p2_visits ?? 0);
  const p1Charge = Number(row?.p1_charge ?? 0);
  const p2Charge = Number(row?.p2_charge ?? 0);

  return {
    yearThai,
    monthThai,
    label: `${monthLabel} ${yearThai}`,
    p1Visits,
    p2Visits,
    monthVisits: p1Visits + p2Visits,
    p1Charge,
    p2Charge,
    monthCharge: p1Charge + p2Charge,
    unitCount: Number(row?.unit_count ?? 0),
    compensation: 0,
  };
}

export async function getDashboardPayload(
  yearThai: number,
  monthThai: number,
): Promise<DashboardPayload> {
  const months = await listAvailableSummaryMonths();
  const current = await loadMonthPeriodStats(yearThai, monthThai);
  const prev = prevYearMonth(yearThai, monthThai);

  const prevExists = months.some(
    (m) => m.yearThai === prev.year && m.monthThai === prev.month,
  );
  const previous = prevExists
    ? await loadMonthPeriodStats(prev.year, prev.month)
    : null;

  // Trend: up to last 12 available months ending at selected
  const selectedIdx = months.findIndex(
    (m) => m.yearThai === yearThai && m.monthThai === monthThai,
  );
  const trendMonths =
    selectedIdx >= 0
      ? months.slice(selectedIdx, selectedIdx + 12).reverse()
      : months.slice(0, 12).reverse();

  const trend: MonthPeriodStats[] = [];
  for (const m of trendMonths) {
    trend.push(await loadMonthPeriodStats(m.yearThai, m.monthThai));
  }

  return {
    months,
    selectedYear: yearThai,
    selectedMonth: monthThai,
    selectedLabel: current.label,
    previousLabel: previous?.label ?? null,
    current,
    previous,
    cards: {
      visits: metricDelta(current.monthVisits, previous?.monthVisits ?? null),
      charge: metricDelta(current.monthCharge, previous?.monthCharge ?? null),
      units: metricDelta(current.unitCount, previous?.unitCount ?? null),
      compensation: metricDelta(
        current.compensation,
        previous?.compensation ?? null,
      ),
    },
    periodCards: {
      p1Visits: metricDelta(current.p1Visits, previous?.p1Visits ?? null),
      p2Visits: metricDelta(current.p2Visits, previous?.p2Visits ?? null),
      p1Charge: metricDelta(current.p1Charge, previous?.p1Charge ?? null),
      p2Charge: metricDelta(current.p2Charge, previous?.p2Charge ?? null),
    },
    trend,
  };
}

