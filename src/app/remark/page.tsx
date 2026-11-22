import { Suspense } from "react";
import { Prisma } from "@prisma/client";
import { PageShell } from "@/components/page-shell";
import {
  RemarkWorkspace,
  type AvailablePeriodOption,
  type RemarkSummaryRowDto,
} from "@/components/remark-workspace";
import type { RemarkRuleDto } from "@/components/remark-rules-manager";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { canAccessRemark } from "@/lib/roles";
import { redirect } from "next/navigation";

const PAGE_SIZE = 30;

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  year?: string;
  month?: string;
  period?: string;
  status?: string;
  rule?: string;
  q?: string;
  tab?: string;
  page?: string;
}>;

export default async function RemarkPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession();
  if (!canAccessRemark(session.user.role)) {
    redirect("/summary");
  }
  const params = await searchParams;

  // 1. Discover available imported (year, month, period) combinations in DB
  const periodGroups = await prisma.eclaimTransactionSummary.groupBy({
    by: ["importYearThai", "importMonthThai", "importPeriod"],
    _count: { _all: true },
    orderBy: [
      { importYearThai: "desc" },
      { importMonthThai: "desc" },
      { importPeriod: "asc" },
    ],
  });

  const availablePeriods: AvailablePeriodOption[] = periodGroups.map((g) => ({
    yearThai: g.importYearThai,
    monthThai: g.importMonthThai,
    period: g.importPeriod,
    count: g._count._all,
  }));

  const defaultLatest = availablePeriods[0] ?? {
    yearThai: 2569,
    monthThai: 8,
    period: 1,
    count: 0,
  };

  const selectedYear =
    Number(params.year) > 2400 ? Number(params.year) : defaultLatest.yearThai;
  const selectedMonth =
    Number(params.month) >= 1 && Number(params.month) <= 12
      ? Number(params.month)
      : defaultLatest.monthThai;
  const selectedPeriod =
    params.period === "0" || params.period === "all"
      ? 0
      : params.period === "1" || params.period === "2"
        ? Number(params.period)
        : defaultLatest.period;

  const selectedStatus = ["ALL", "PASS", "PRUNED_OUT", "UNCHECKED"].includes(
    (params.status ?? "").toUpperCase(),
  )
    ? (params.status ?? "ALL").toUpperCase()
    : "ALL";

  const selectedRuleCode = (params.rule ?? "").trim();
  const searchQuery = (params.q ?? "").trim();
  const activeTab = params.tab === "rules" ? "rules" : "data";
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const baseScopeWhere: Prisma.EclaimTransactionSummaryWhereInput = {
    importYearThai: selectedYear,
    importMonthThai: selectedMonth,
    ...(selectedPeriod === 1 || selectedPeriod === 2
      ? { importPeriod: selectedPeriod }
      : {}),
  };

  // 2. KPI aggregation + Rule match counts + Rules list in parallel
  const [statusAgg, ruleHitAgg, dbRules] = await Promise.all([
    prisma.eclaimTransactionSummary.groupBy({
      by: ["remarkStatus"],
      where: baseScopeWhere,
      _count: { _all: true },
      _sum: { chargeCost: true },
    }),
    prisma.eclaimTransactionSummary.groupBy({
      by: ["remarkRuleCode"],
      where: {
        ...baseScopeWhere,
        remarkRuleCode: { not: null },
      },
      _count: { _all: true },
    }),
    prisma.remarkRule.findMany({
      orderBy: [{ priority: "asc" }, { code: "asc" }],
    }),
  ]);

  let passCount = 0;
  let prunedCount = 0;
  let uncheckedCount = 0;
  let passCharge = 0;
  let prunedCharge = 0;

  for (const g of statusAgg) {
    const cnt = g._count._all;
    const sumCost = g._sum.chargeCost ? Number(g._sum.chargeCost.toString()) : 0;
    if (g.remarkStatus === "PASS") {
      passCount += cnt;
      passCharge += sumCost;
    } else if (g.remarkStatus === "PRUNED_OUT") {
      prunedCount += cnt;
      prunedCharge += sumCost;
    } else {
      uncheckedCount += cnt;
      passCharge += sumCost;
    }
  }

  const hitByRule = new Map<string, number>();
  for (const rh of ruleHitAgg) {
    if (rh.remarkRuleCode) {
      hitByRule.set(rh.remarkRuleCode, rh._count._all);
    }
  }

  const rulesDto: RemarkRuleDto[] = dbRules.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    remarkText: r.remarkText,
    outcome: r.outcome,
    priority: r.priority,
    active: r.active,
    conditionMode: r.conditionMode,
    conditionsJson: r.conditionsJson,
    sqlWhere: r.sqlWhere,
    matchedCountInPeriod: hitByRule.get(r.code) ?? 0,
  }));

  // 3. Filtered Summary rows query
  const filteredWhere: Prisma.EclaimTransactionSummaryWhereInput = {
    ...baseScopeWhere,
  };

  if (selectedStatus === "PASS") {
    filteredWhere.remarkStatus = "PASS";
  } else if (selectedStatus === "PRUNED_OUT") {
    filteredWhere.remarkStatus = "PRUNED_OUT";
  } else if (selectedStatus === "UNCHECKED") {
    filteredWhere.remarkStatus = null;
  }

  if (selectedRuleCode) {
    filteredWhere.remarkRuleCode = selectedRuleCode;
  }

  if (searchQuery) {
    filteredWhere.OR = [
      { hcode: { contains: searchQuery, mode: "insensitive" } },
      { hn: { contains: searchQuery, mode: "insensitive" } },
      { hname: { contains: searchQuery, mode: "insensitive" } },
      { hmain2: { contains: searchQuery, mode: "insensitive" } },
      { pdx: { contains: searchQuery, mode: "insensitive" } },
      { remarkNote: { contains: searchQuery, mode: "insensitive" } },
      { remarkRuleCode: { contains: searchQuery, mode: "insensitive" } },
      ...(/^\d+$/.test(searchQuery) ? [{ tranId: BigInt(searchQuery) }] : []),
    ];
  }

  const [rawRows, totalFilteredRows] = await Promise.all([
    prisma.eclaimTransactionSummary.findMany({
      where: filteredWhere,
      orderBy: [{ tranId: "asc" }],
      skip,
      take: PAGE_SIZE,
      select: {
        id: true,
        tranId: true,
        hcode: true,
        hname: true,
        hmain2: true,
        hname2: true,
        hsubAf: true,
        hn: true,
        dateadm: true,
        maininsclAf: true,
        subinsclAf: true,
        fundAf: true,
        subFund: true,
        pdx: true,
        chargeCost: true,
        sumsCost: true,
        stmtPeriod: true,
        importPeriod: true,
        remarkStatus: true,
        remarkRuleCode: true,
        remarkNote: true,
        remarkedAt: true,
      },
    }),
    prisma.eclaimTransactionSummary.count({ where: filteredWhere }),
  ]);

  const rowsDto: RemarkSummaryRowDto[] = rawRows.map((r) => ({
    id: r.id,
    tranId: r.tranId != null ? r.tranId.toString() : "",
    hcode: r.hcode ?? "",
    hname: r.hname ?? "",
    hmain2: r.hmain2 ?? "",
    hname2: r.hname2 ?? "",
    hsubAf: r.hsubAf ?? "",
    hn: r.hn ?? "",
    dateadm: r.dateadm ?? "",
    maininsclAf: r.maininsclAf ?? "",
    subinsclAf: r.subinsclAf ?? "",
    fundAf: r.fundAf ?? "",
    subFund: r.subFund ?? "",
    pdx: r.pdx ?? "",
    chargeCost: r.chargeCost ? Number(r.chargeCost.toString()) : 0,
    sumsCost: r.sumsCost ? Number(r.sumsCost.toString()) : 0,
    stmtPeriod: r.stmtPeriod ?? "",
    importPeriod: r.importPeriod,
    remarkStatus: r.remarkStatus,
    remarkRuleCode: r.remarkRuleCode,
    remarkNote: r.remarkNote,
    remarkedAt: r.remarkedAt ? r.remarkedAt.toISOString() : null,
  }));

  return (
    <PageShell
      activePath="/remark"
      header={
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Remark · ระบบคัดกรองและตรวจสอบเกณฑ์เบิกจ่ายรายงวด
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            ประมวลผลเงื่อนไขการคัดออกจากฐานข้อมูลกฎ (
            <code className="text-teal-800">remark_rules</code>) เติมสถานะและ{" "}
            <code className="text-teal-800">remark_note</code> ลงตาราง{" "}
            <code className="text-teal-800">eclaim_transaction_summary</code>{" "}
            พร้อมส่งออกไฟล์ Excel รายงวด
          </p>
        </div>
      }
    >
      <Suspense fallback={null}>
        <RemarkWorkspace
          canRunAndManage={canAccessRemark(session.user.role)}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          selectedPeriod={selectedPeriod}
          selectedStatus={selectedStatus}
          selectedRuleCode={selectedRuleCode}
          searchQuery={searchQuery}
          activeTab={activeTab}
          page={page}
          pageSize={PAGE_SIZE}
          totalFilteredRows={totalFilteredRows}
          availablePeriods={availablePeriods}
          kpi={{
            totalRows: passCount + prunedCount + uncheckedCount,
            passCount,
            prunedCount,
            uncheckedCount,
            passCharge,
            prunedCharge,
          }}
          rows={rowsDto}
          rules={rulesDto}
        />
      </Suspense>
    </PageShell>
  );
}
