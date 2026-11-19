import "server-only";

import { prisma } from "@/lib/prisma";
import { THAI_MONTHS } from "@/lib/import-metadata";

export type MonthOption = {
  yearThai: number;
  monthThai: number;
  label: string;
};

export type HcodeCrosstabRow = {
  hcode: string;
  hname: string;
  affiliation: string;
  p1TranCount: number;
  p1ChargeCost: number;
  p2TranCount: number;
  p2ChargeCost: number;
  monthTranCount: number;
  monthChargeCost: number;
};

export type AffiliationGroup = {
  affiliation: string;
  rows: HcodeCrosstabRow[];
  p1TranCount: number;
  p1ChargeCost: number;
  p2TranCount: number;
  p2ChargeCost: number;
  monthTranCount: number;
  monthChargeCost: number;
};

export type CrosstabResult = {
  groups: AffiliationGroup[];
  totals: {
    p1TranCount: number;
    p1ChargeCost: number;
    p2TranCount: number;
    p2ChargeCost: number;
    monthTranCount: number;
    monthChargeCost: number;
    unitCount: number;
  };
};

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

export async function getHcodeCrosstabForMonth(
  yearThai: number,
  monthThai: number,
): Promise<CrosstabResult> {
  const rows = await prisma.$queryRaw<
    {
      hcode: string | null;
      hname: string | null;
      affiliation: string | null;
      p1_tran_count: bigint;
      p1_charge_cost: string | number | null;
      p2_tran_count: bigint;
      p2_charge_cost: string | number | null;
    }[]
  >`
    SELECT
      COALESCE(s.hcode, '') AS hcode,
      COALESCE(MAX(s.hname), '') AS hname,
      COALESCE(NULLIF(TRIM(ho.affiliation), ''), 'ไม่ระบุต้นสังกัด') AS affiliation,
      COUNT(*) FILTER (WHERE s.import_period = 1)::bigint AS p1_tran_count,
      COALESCE(SUM(s.charge_cost) FILTER (WHERE s.import_period = 1), 0) AS p1_charge_cost,
      COUNT(*) FILTER (WHERE s.import_period = 2)::bigint AS p2_tran_count,
      COALESCE(SUM(s.charge_cost) FILTER (WHERE s.import_period = 2), 0) AS p2_charge_cost
    FROM eclaim_transaction_summary s
    LEFT JOIN ref_health_office ho
      ON LPAD(TRIM(COALESCE(s.hcode, '')), 5, '0') = LPAD(TRIM(ho.hcode), 5, '0')
    WHERE s.import_year_thai = ${yearThai}
      AND s.import_month_thai = ${monthThai}
    GROUP BY COALESCE(s.hcode, ''), COALESCE(NULLIF(TRIM(ho.affiliation), ''), 'ไม่ระบุต้นสังกัด')
    ORDER BY affiliation, COALESCE(s.hcode, '')
  `;

  const mapped: HcodeCrosstabRow[] = rows.map((r) => {
    const p1TranCount = Number(r.p1_tran_count);
    const p1ChargeCost = Number(r.p1_charge_cost ?? 0);
    const p2TranCount = Number(r.p2_tran_count);
    const p2ChargeCost = Number(r.p2_charge_cost ?? 0);
    return {
      hcode: r.hcode || "(ว่าง)",
      hname: r.hname || "—",
      affiliation: r.affiliation || "ไม่ระบุต้นสังกัด",
      p1TranCount,
      p1ChargeCost,
      p2TranCount,
      p2ChargeCost,
      monthTranCount: p1TranCount + p2TranCount,
      monthChargeCost: p1ChargeCost + p2ChargeCost,
    };
  });

  const groupMap = new Map<string, AffiliationGroup>();
  for (const row of mapped) {
    let group = groupMap.get(row.affiliation);
    if (!group) {
      group = {
        affiliation: row.affiliation,
        rows: [],
        p1TranCount: 0,
        p1ChargeCost: 0,
        p2TranCount: 0,
        p2ChargeCost: 0,
        monthTranCount: 0,
        monthChargeCost: 0,
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
      unitCount: acc.unitCount + g.rows.length,
    }),
    {
      p1TranCount: 0,
      p1ChargeCost: 0,
      p2TranCount: 0,
      p2ChargeCost: 0,
      monthTranCount: 0,
      monthChargeCost: 0,
      unitCount: 0,
    },
  );

  return { groups, totals };
}
