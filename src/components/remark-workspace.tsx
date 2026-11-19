"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  runRemarkCheckAction,
  type RemarkActionResult,
} from "@/app/remark/actions";
import {
  RemarkRulesManager,
  type RemarkRuleDto,
} from "@/components/remark-rules-manager";
import {
  StickyTableFrame,
  stickyThClass,
  stickyTheadClass,
} from "@/components/sticky-table-frame";
import { THAI_MONTHS } from "@/lib/import-metadata";

export type AvailablePeriodOption = {
  yearThai: number;
  monthThai: number;
  period: number;
  count: number;
};

export type RemarkSummaryRowDto = {
  id: string;
  tranId: string;
  hcode: string;
  hname: string;
  hmain2: string;
  hname2: string;
  hsubAf: string;
  hn: string;
  dateadm: string;
  maininsclAf: string;
  subinsclAf: string;
  fundAf: string;
  subFund: string;
  pdx: string;
  chargeCost: number;
  sumsCost: number;
  stmtPeriod: string;
  importPeriod: number;
  remarkStatus: string | null;
  remarkRuleCode: string | null;
  remarkNote: string | null;
  remarkedAt: string | null;
};

type Props = {
  canRunAndManage: boolean;
  selectedYear: number;
  selectedMonth: number;
  selectedPeriod: number; // 0 = all periods in month, 1 = period 1, 2 = period 2
  selectedStatus: string; // ALL | PASS | PRUNED_OUT | UNCHECKED
  selectedRuleCode: string;
  searchQuery: string;
  activeTab: "data" | "rules";
  page: number;
  pageSize: number;
  totalFilteredRows: number;
  availablePeriods: AvailablePeriodOption[];
  kpi: {
    totalRows: number;
    passCount: number;
    prunedCount: number;
    uncheckedCount: number;
    passCharge: number;
    prunedCharge: number;
  };
  rows: RemarkSummaryRowDto[];
  rules: RemarkRuleDto[];
};

export function RemarkWorkspace({
  canRunAndManage,
  selectedYear,
  selectedMonth,
  selectedPeriod,
  selectedStatus,
  selectedRuleCode,
  searchQuery,
  activeTab,
  page,
  pageSize,
  totalFilteredRows,
  availablePeriods,
  kpi,
  rows,
  rules,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [running, startRunTransition] = useTransition();
  const [runResult, setRunResult] = useState<RemarkActionResult | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalFilteredRows / pageSize));

  // Distinct years available + fallback
  const yearsSet = new Set<number>(availablePeriods.map((p) => p.yearThai));
  yearsSet.add(selectedYear);
  const years = Array.from(yearsSet).sort((a, b) => b - a);

  function pushParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    router.push(`/remark?${params.toString()}`);
  }

  function handleRunRemark() {
    setRunResult(null);
    startRunTransition(async () => {
      const res = await runRemarkCheckAction({
        yearThai: selectedYear,
        monthThai: selectedMonth,
        period: selectedPeriod,
      });
      setRunResult(res);
      router.refresh();
    });
  }

  function buildExportUrl(statusFilter: string) {
    const p = new URLSearchParams({
      year: String(selectedYear),
      month: String(selectedMonth),
      period: selectedPeriod === 0 ? "all" : String(selectedPeriod),
      status: statusFilter,
    });
    if (selectedRuleCode && statusFilter !== "PASS") {
      p.set("rule", selectedRuleCode);
    }
    if (searchQuery) {
      p.set("q", searchQuery);
    }
    return `/api/remark/export?${p.toString()}`;
  }

  const monthLabel =
    THAI_MONTHS.find((m) => m.value === selectedMonth)?.label ??
    String(selectedMonth);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Top Period & Action Bar */}
      <section className="shrink-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                ปี พ.ศ.
              </label>
              <select
                value={selectedYear}
                onChange={(e) =>
                  pushParams({ year: e.target.value, page: "1" })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    พ.ศ. {y}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                เดือน
              </label>
              <select
                value={selectedMonth}
                onChange={(e) =>
                  pushParams({ month: e.target.value, page: "1" })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
              >
                {THAI_MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {String(m.value).padStart(2, "0")} - {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                งวด (Period)
              </label>
              <select
                value={selectedPeriod}
                onChange={(e) =>
                  pushParams({ period: e.target.value, page: "1" })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
              >
                <option value={0}>ทั้งเดือน (งวด 1 + งวด 2)</option>
                <option value={1}>งวดที่ 1 (01)</option>
                <option value={2}>งวดที่ 2 (02)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canRunAndManage ? (
              <button
                type="button"
                disabled={running || kpi.totalRows === 0}
                onClick={handleRunRemark}
                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-50"
              >
                {running
                  ? "กำลังประมวลผลกฎ..."
                  : "รันตรวจสอบตามกฎ (Run Remark)"}
              </button>
            ) : null}

            <div className="inline-flex flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-1">
              <a
                href={buildExportUrl("PASS")}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
              >
                ส่งออกที่ผ่าน (.xlsx)
              </a>
              <a
                href={buildExportUrl("PRUNED_OUT")}
                className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700"
              >
                ส่งออกที่ไม่ผ่าน (.xlsx)
              </a>
              <a
                href={buildExportUrl("ALL")}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                ส่งออกทั้งหมด (.xlsx)
              </a>
            </div>
          </div>
        </div>

        {/* Quick Period Chips for Existing Imported Data */}
        {availablePeriods.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3 text-xs">
            <span className="mr-1 font-medium text-slate-500">
              งวดที่มีข้อมูลในระบบ:
            </span>
            {availablePeriods.map((p) => {
              const isSelected =
                p.yearThai === selectedYear &&
                p.monthThai === selectedMonth &&
                p.period === selectedPeriod;
              const mName =
                THAI_MONTHS.find((m) => m.value === p.monthThai)?.label ??
                p.monthThai;
              return (
                <button
                  key={`${p.yearThai}-${p.monthThai}-${p.period}`}
                  type="button"
                  onClick={() =>
                    pushParams({
                      year: String(p.yearThai),
                      month: String(p.monthThai),
                      period: String(p.period),
                      page: "1",
                    })
                  }
                  className={`rounded-full px-2.5 py-1 font-medium transition ${
                    isSelected
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {mName} {p.yearThai} งวด {p.period} (
                  {p.count.toLocaleString()})
                </button>
              );
            })}
          </div>
        ) : null}

        {runResult ? (
          <div
            className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
              runResult.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            <div className="font-semibold">{runResult.message}</div>
            {runResult.summary && runResult.summary.ruleBreakdown.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {runResult.summary.ruleBreakdown.map((rb) => (
                  <span
                    key={rb.ruleCode}
                    className="rounded-md bg-white/80 px-2 py-1 font-mono text-slate-700 ring-1 ring-emerald-200"
                  >
                    {rb.ruleCode}: {rb.matchedRows.toLocaleString()} รายการ
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* KPI Summary Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={() =>
            pushParams({ status: "ALL", rule: null, tab: "data", page: "1" })
          }
          className={`rounded-xl border p-4 text-left shadow-sm transition ${
            selectedStatus === "ALL" && activeTab === "data"
              ? "border-slate-900 bg-white ring-2 ring-slate-900/10"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            รายการทั้งหมด ({monthLabel} {selectedYear}{" "}
            {selectedPeriod === 0 ? "ทั้งเดือน" : `งวด ${selectedPeriod}`})
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900">
            {kpi.totalRows.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            ยอดขอเบิกรวม{" "}
            {(kpi.passCharge + kpi.prunedCharge).toLocaleString("th-TH", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            บาท
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            pushParams({ status: "PASS", rule: null, tab: "data", page: "1" })
          }
          className={`rounded-xl border p-4 text-left shadow-sm transition ${
            selectedStatus === "PASS" && activeTab === "data"
              ? "border-emerald-600 bg-emerald-50/40 ring-2 ring-emerald-600/20"
              : "border-emerald-200 bg-white hover:border-emerald-300"
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            ผ่านเกณฑ์ (PASS)
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-700">
              {kpi.passCount.toLocaleString()}
            </span>
            {kpi.totalRows > 0 ? (
              <span className="text-xs font-medium text-emerald-600">
                ({((kpi.passCount * 100) / kpi.totalRows).toFixed(2)}%)
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            ยอดขอเบิก{" "}
            {kpi.passCharge.toLocaleString("th-TH", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            บาท
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            pushParams({
              status: "PRUNED_OUT",
              rule: null,
              tab: "data",
              page: "1",
            })
          }
          className={`rounded-xl border p-4 text-left shadow-sm transition ${
            selectedStatus === "PRUNED_OUT" && activeTab === "data"
              ? "border-rose-600 bg-rose-50/40 ring-2 ring-rose-600/20"
              : "border-rose-200 bg-white hover:border-rose-300"
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-rose-700">
            ไม่ผ่าน / คัดออก (PRUNED_OUT)
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-700">
              {kpi.prunedCount.toLocaleString()}
            </span>
            {kpi.totalRows > 0 ? (
              <span className="text-xs font-medium text-rose-600">
                ({((kpi.prunedCount * 100) / kpi.totalRows).toFixed(2)}%)
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            ยอดขอเบิกที่คัดออก{" "}
            {kpi.prunedCharge.toLocaleString("th-TH", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            บาท
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            pushParams({
              status: "UNCHECKED",
              rule: null,
              tab: "data",
              page: "1",
            })
          }
          className={`rounded-xl border p-4 text-left shadow-sm transition ${
            selectedStatus === "UNCHECKED" && activeTab === "data"
              ? "border-amber-500 bg-amber-50/40 ring-2 ring-amber-500/20"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            ยังไม่ได้รันตรวจสอบ
          </div>
          <div className="mt-1 text-2xl font-bold text-amber-700">
            {kpi.uncheckedCount.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            กดปุ่ม &ldquo;รันตรวจสอบตามกฎ&rdquo; เพื่อเติม Remark
          </div>
        </button>
      </section>

      {/* Main Workspace Tabs: Data View vs Rule Database Management */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => pushParams({ tab: "data" })}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === "data"
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            รายการข้อมูล Summary (ผ่าน / ไม่ผ่าน)
          </button>
          <button
            type="button"
            onClick={() => pushParams({ tab: "rules" })}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === "rules"
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            ตั้งค่ากฎการคัดออก ({rules.filter((r) => r.active).length}/
            {rules.length} กฎ)
          </button>
        </div>

        {/* Rule quick-filter pills when viewing Data tab */}
        {activeTab === "data" && rules.some((r) => r.matchedCountInPeriod > 0) ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-500">กรองตามกฎ:</span>
            {selectedRuleCode ? (
              <button
                type="button"
                onClick={() => pushParams({ rule: null, page: "1" })}
                className="rounded-full bg-slate-200 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-300"
              >
                ล้างตัวกรองกฎ ✕
              </button>
            ) : null}
            {rules
              .filter((r) => r.matchedCountInPeriod > 0)
              .map((r) => (
                <button
                  key={r.code}
                  type="button"
                  onClick={() =>
                    pushParams({
                      rule: selectedRuleCode === r.code ? null : r.code,
                      status: r.outcome === "PASS" ? "PASS" : "PRUNED_OUT",
                      page: "1",
                    })
                  }
                  className={`rounded-full px-2.5 py-1 font-mono font-medium transition ${
                    selectedRuleCode === r.code
                      ? "bg-rose-700 text-white"
                      : "bg-rose-50 text-rose-800 ring-1 ring-rose-200 hover:bg-rose-100"
                  }`}
                >
                  {r.code} ({r.matchedCountInPeriod.toLocaleString()})
                </button>
              ))}
          </div>
        ) : null}
      </div>

      {activeTab === "rules" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <RemarkRulesManager rules={rules} canManage={canRunAndManage} />
        </div>
      ) : (
        <section className="flex min-h-0 flex-1 flex-col gap-3">
          {/* Search & Pagination Toolbar */}
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <form
              className="flex flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                pushParams({
                  q: String(fd.get("q") ?? "").trim(),
                  page: "1",
                });
              }}
            >
              <input
                name="q"
                defaultValue={searchQuery}
                placeholder="ค้นหา TRAN_ID, HCODE, ชื่อหน่วยบริการ, HN, รหัสกฎ หรือข้อความ Remark..."
                className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-teal-600/30 focus:ring-2"
              />
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                ค้นหา
              </button>
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => pushParams({ q: null, page: "1" })}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600"
                >
                  ล้าง
                </button>
              ) : null}
            </form>

            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span>
                แสดง {totalFilteredRows.toLocaleString()} รายการ · หน้า {page} /{" "}
                {totalPages}
              </span>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => pushParams({ page: String(page - 1) })}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 disabled:opacity-40"
              >
                ก่อนหน้า
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => pushParams({ page: String(page + 1) })}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 disabled:opacity-40"
              >
                ถัดไป
              </button>
            </div>
          </div>

          {/* Summary Remark Table */}
          <StickyTableFrame
            empty={rows.length === 0}
            emptyMessage="ไม่พบรายการข้อมูลในเงื่อนไขที่เลือก"
          >
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className={stickyTheadClass}>
                <tr>
                  <th className={stickyThClass}>สถานะ</th>
                  <th className={stickyThClass}>รหัสกฎ / Remark</th>
                  <th className={stickyThClass}>TRAN_ID</th>
                  <th className={stickyThClass}>งวด</th>
                  <th className={stickyThClass}>หน่วยบริการรักษา (HCODE)</th>
                  <th className={stickyThClass}>
                    หน่วยประจำ (HMAIN2) / ปฐมภูมิ (HSUB)
                  </th>
                  <th className={stickyThClass}>สิทธิ / กองทุนย่อย</th>
                  <th className={stickyThClass}>วันรับบริการ / PDX</th>
                  <th className={`${stickyThClass} text-right`}>ยอดขอเบิก</th>
                </tr>
              </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => {
                        if (r.tranId) {
                          router.push(
                            `/detail?tranId=${encodeURIComponent(r.tranId)}`,
                          );
                        }
                      }}
                      title="คลิกเพื่อเปิดดูใบเสร็จรายการรักษา (Detail)"
                      className="cursor-pointer border-t border-slate-100 transition-colors hover:bg-teal-50/60"
                    >
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {r.remarkStatus === "PASS" ? (
                          <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                            ผ่าน (PASS)
                          </span>
                        ) : r.remarkStatus === "PRUNED_OUT" ? (
                          <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
                            ไม่ผ่าน (คัดออก)
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                            ยังไม่ตรวจ
                          </span>
                        )}
                      </td>
                      <td className="max-w-xs px-3 py-2.5">
                        {r.remarkRuleCode ? (
                          <div className="font-mono text-xs font-semibold text-slate-700">
                            {r.remarkRuleCode}
                          </div>
                        ) : null}
                        <div className="truncate text-xs text-slate-600" title={r.remarkNote ?? ""}>
                          {r.remarkNote ?? "-"}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono font-medium text-teal-700 underline decoration-teal-300 underline-offset-2">
                        {r.tranId}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">
                        งวด {r.importPeriod}
                        {r.stmtPeriod ? (
                          <div className="font-mono text-[11px] text-slate-400">
                            {r.stmtPeriod}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-mono text-xs font-semibold text-slate-900">
                          {r.hcode}
                        </div>
                        <div className="max-w-[180px] truncate text-xs text-slate-600">
                          {r.hname}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <div>
                          <span className="font-mono font-semibold text-slate-800">
                            {r.hmain2}
                          </span>{" "}
                          <span className="text-slate-600">{r.hname2}</span>
                        </div>
                        <div className="text-slate-500">
                          ปฐมภูมิ: <span className="font-mono">{r.hsubAf}</span>
                        </div>
                      </td>
                      <td className="max-w-[200px] px-3 py-2.5 text-xs">
                        <div className="font-medium text-slate-800">
                          {r.maininsclAf} ({r.subinsclAf}) · {r.fundAf}
                        </div>
                        <div className="truncate text-slate-500" title={r.subFund}>
                          {r.subFund}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-700">
                        <div>{r.dateadm}</div>
                        <div className="font-mono font-semibold text-teal-800">
                          PDX: {r.pdx || "-"}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-sm font-semibold text-slate-900">
                        {r.chargeCost.toLocaleString("th-TH", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          </StickyTableFrame>
        </section>
      )}
    </div>
  );
}
