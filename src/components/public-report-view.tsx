"use client";

import { Fragment } from "react";
import { useRouter } from "next/navigation";
import type {
  CrosstabResult,
  MonthOption,
  ReportKind,
} from "@/lib/report-types";
import {
  StickyTableFrame,
  stickyThClass,
  stickyTheadClass,
} from "@/components/sticky-table-frame";

const MOPH_AFFILIATION = "กระทรวงสาธารณสุข";

type Props = {
  kind: ReportKind;
  title: string;
  subtitle: string;
  codeLabel: string;
  nameLabel: string;
  months: MonthOption[];
  selectedYear: number | null;
  selectedMonth: number | null;
  crosstab: CrosstabResult;
  path: string;
};

function formatNum(n: number): string {
  return n.toLocaleString("th-TH");
}

function formatMoney(n: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function PublicReportView({
  kind,
  title,
  subtitle,
  codeLabel,
  nameLabel,
  months,
  selectedYear,
  selectedMonth,
  crosstab,
  path,
}: Props) {
  const router = useRouter();
  const { groups, totals } = crosstab;
  const showPeriods = kind !== "payment";
  const colSpan = showPeriods ? 8 : 5;

  function exportUrl(format: "csv" | "xlsx") {
    if (!selectedYear || !selectedMonth) return "#";
    const q = new URLSearchParams({
      kind,
      year: String(selectedYear),
      month: String(selectedMonth),
      format,
    });
    return `/api/reports/export?${q.toString()}`;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {title}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      </div>

      <form
        className="flex shrink-0 flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const value = String(fd.get("monthKey") ?? "");
          if (!value) {
            router.push(path);
            return;
          }
          const [y, m] = value.split("-");
          router.push(`${path}?year=${y}&month=${m}`);
        }}
      >
        <label className="text-sm">
          <span className="font-medium text-slate-700">เดือน / ปี พ.ศ.</span>
          <select
            name="monthKey"
            defaultValue={
              selectedYear && selectedMonth
                ? `${selectedYear}-${selectedMonth}`
                : months[0]
                  ? `${months[0].yearThai}-${months[0].monthThai}`
                  : ""
            }
            className="mt-1 block min-w-[220px] rounded-lg border border-slate-300 px-3 py-2"
          >
            {months.length === 0 ? (
              <option value="">ยังไม่มีข้อมูล Summary</option>
            ) : (
              months.map((m) => (
                <option
                  key={`${m.yearThai}-${m.monthThai}`}
                  value={`${m.yearThai}-${m.monthThai}`}
                >
                  {m.label}
                </option>
              ))
            )}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
        >
          แสดงสรุป
        </button>
        <a
          href={exportUrl("xlsx")}
          className={`rounded-lg border border-teal-700 bg-white px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 ${
            !selectedYear || !selectedMonth ? "pointer-events-none opacity-40" : ""
          }`}
        >
          ส่งออก Excel
        </a>
        <a
          href={exportUrl("csv")}
          className={`rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 ${
            !selectedYear || !selectedMonth ? "pointer-events-none opacity-40" : ""
          }`}
        >
          ส่งออก CSV
        </a>
      </form>

      {months.length === 0 ? (
        <StickyTableFrame empty emptyMessage="ยังไม่มีข้อมูล Summary ในระบบ" />
      ) : (
        <StickyTableFrame
          empty={groups.length === 0}
          emptyMessage="ไม่พบข้อมูลในเดือนที่เลือก"
        >
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className={stickyTheadClass}>
              {showPeriods ? (
                <>
                  <tr>
                    <th
                      rowSpan={2}
                      className={`${stickyThClass} border-b border-slate-200`}
                    >
                      {codeLabel}
                    </th>
                    <th
                      rowSpan={2}
                      className={`${stickyThClass} border-b border-slate-200`}
                    >
                      {nameLabel}
                    </th>
                    <th
                      colSpan={2}
                      className={`${stickyThClass} border-b border-slate-200 text-center`}
                    >
                      งวด 1
                    </th>
                    <th
                      colSpan={2}
                      className={`${stickyThClass} border-b border-slate-200 text-center`}
                    >
                      งวด 2
                    </th>
                    <th
                      colSpan={2}
                      className={`${stickyThClass} border-b border-slate-200 bg-teal-50 text-center text-teal-900`}
                    >
                      รวมเดือน
                    </th>
                  </tr>
                  <tr>
                    <th className={`${stickyThClass} border-b border-slate-200 text-right`}>
                      Visit
                    </th>
                    <th className={`${stickyThClass} border-b border-slate-200 text-right`}>
                      ค่าบริการ(บาท)
                    </th>
                    <th className={`${stickyThClass} border-b border-slate-200 text-right`}>
                      Visit
                    </th>
                    <th className={`${stickyThClass} border-b border-slate-200 text-right`}>
                      ค่าบริการ(บาท)
                    </th>
                    <th className={`${stickyThClass} border-b border-slate-200 bg-teal-50 text-right text-teal-900`}>
                      Visit
                    </th>
                    <th className={`${stickyThClass} border-b border-slate-200 bg-teal-50 text-right text-teal-900`}>
                      ค่าบริการ(บาท)
                    </th>
                  </tr>
                </>
              ) : (
                <tr>
                  <th className={stickyThClass}>{codeLabel}</th>
                  <th className={stickyThClass}>{nameLabel}</th>
                  <th className={`${stickyThClass} text-right`}>Visit</th>
                  <th className={`${stickyThClass} text-right`}>ค่าบริการ(บาท)</th>
                  <th className={`${stickyThClass} text-right`}>
                    จำนวนเงินชดเชย(บาท)
                  </th>
                </tr>
              )}
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={group.affiliation}>
                  <tr className="bg-slate-100/90">
                    <td
                      colSpan={colSpan}
                      className="px-3 py-2 text-sm font-semibold text-slate-800"
                    >
                      ต้นสังกัด: {group.affiliation}
                      <span className="ml-2 font-normal text-slate-500">
                        ({formatNum(group.rows.length)} หน่วย)
                      </span>
                    </td>
                  </tr>

                  {group.affiliation === MOPH_AFFILIATION &&
                  group.departments.length > 0
                    ? group.departments.map((dept) => (
                        <Fragment key={`${group.affiliation}-${dept.department}`}>
                          <tr className="bg-slate-50">
                            <td
                              colSpan={colSpan}
                              className="px-3 py-1.5 pl-6 text-xs font-semibold text-slate-700"
                            >
                              แผนก/กรม: {dept.department}
                              <span className="ml-2 font-normal text-slate-500">
                                ({formatNum(dept.rows.length)} หน่วย)
                              </span>
                            </td>
                          </tr>
                          {dept.rows.map((r) => (
                            <DataRow
                              key={`${dept.department}-${r.code}`}
                              r={r}
                              showPeriods={showPeriods}
                            />
                          ))}
                          <SubtotalRow
                            label={`รวมแผนก/กรม ${dept.department}`}
                            p1TranCount={dept.p1TranCount}
                            p1ChargeCost={dept.p1ChargeCost}
                            p2TranCount={dept.p2TranCount}
                            p2ChargeCost={dept.p2ChargeCost}
                            monthTranCount={dept.monthTranCount}
                            monthChargeCost={dept.monthChargeCost}
                            compensation={dept.compensation}
                            showPeriods={showPeriods}
                            className="bg-slate-50/80 text-slate-700"
                          />
                        </Fragment>
                      ))
                    : group.rows.map((r) => (
                        <DataRow
                          key={`${group.affiliation}-${r.code}`}
                          r={r}
                          showPeriods={showPeriods}
                        />
                      ))}

                  <SubtotalRow
                    label={`รวมต้นสังกัด ${group.affiliation}`}
                    p1TranCount={group.p1TranCount}
                    p1ChargeCost={group.p1ChargeCost}
                    p2TranCount={group.p2TranCount}
                    p2ChargeCost={group.p2ChargeCost}
                    monthTranCount={group.monthTranCount}
                    monthChargeCost={group.monthChargeCost}
                    compensation={group.compensation}
                    showPeriods={showPeriods}
                    className="bg-slate-100 font-semibold text-slate-800"
                  />
                </Fragment>
              ))}
            </tbody>
            {groups.length > 0 ? (
              <tfoot className="sticky bottom-0 z-10 bg-teal-100 font-semibold text-teal-950 shadow-[0_-1px_0_0_rgba(15,23,42,0.08)]">
                {showPeriods ? (
                  <tr>
                    <td className="bg-teal-100 px-3 py-3" colSpan={2}>
                      รวมทั้งเดือน · {formatNum(totals.unitCount)} หน่วย ·{" "}
                      {formatNum(groups.length)} ต้นสังกัด
                    </td>
                    <td className="whitespace-nowrap bg-teal-100 px-3 py-3 text-right tabular-nums">
                      {formatNum(totals.p1TranCount)}
                    </td>
                    <td className="whitespace-nowrap bg-teal-100 px-3 py-3 text-right tabular-nums">
                      {formatMoney(totals.p1ChargeCost)}
                    </td>
                    <td className="whitespace-nowrap bg-teal-100 px-3 py-3 text-right tabular-nums">
                      {formatNum(totals.p2TranCount)}
                    </td>
                    <td className="whitespace-nowrap bg-teal-100 px-3 py-3 text-right tabular-nums">
                      {formatMoney(totals.p2ChargeCost)}
                    </td>
                    <td className="whitespace-nowrap bg-teal-100 px-3 py-3 text-right tabular-nums">
                      {formatNum(totals.monthTranCount)}
                    </td>
                    <td className="whitespace-nowrap bg-teal-100 px-3 py-3 text-right tabular-nums">
                      {formatMoney(totals.monthChargeCost)}
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td className="bg-teal-100 px-3 py-3" colSpan={2}>
                      รวมทั้งเดือน · {formatNum(totals.unitCount)} หน่วย ·{" "}
                      {formatNum(groups.length)} ต้นสังกัด
                    </td>
                    <td className="whitespace-nowrap bg-teal-100 px-3 py-3 text-right tabular-nums">
                      {formatNum(totals.monthTranCount)}
                    </td>
                    <td className="whitespace-nowrap bg-teal-100 px-3 py-3 text-right tabular-nums">
                      {formatMoney(totals.monthChargeCost)}
                    </td>
                    <td className="whitespace-nowrap bg-teal-100 px-3 py-3 text-right tabular-nums">
                      {formatMoney(totals.compensation)}
                    </td>
                  </tr>
                )}
              </tfoot>
            ) : null}
          </table>
        </StickyTableFrame>
      )}
    </div>
  );
}

function DataRow({
  r,
  showPeriods,
}: {
  r: CrosstabResult["groups"][0]["rows"][0];
  showPeriods: boolean;
}) {
  if (!showPeriods) {
    return (
      <tr className="border-t border-slate-100 hover:bg-slate-50/80">
        <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">
          {r.code}
        </td>
        <td className="max-w-xs truncate px-3 py-2 text-slate-700">{r.name}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
          {formatNum(r.monthTranCount)}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
          {formatMoney(r.monthChargeCost)}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
          {formatMoney(r.compensation)}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50/80">
      <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">
        {r.code}
      </td>
      <td className="max-w-xs truncate px-3 py-2 text-slate-700">{r.name}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
        {formatNum(r.p1TranCount)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
        {formatMoney(r.p1ChargeCost)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
        {formatNum(r.p2TranCount)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
        {formatMoney(r.p2ChargeCost)}
      </td>
      <td className="whitespace-nowrap bg-teal-50/40 px-3 py-2 text-right font-medium tabular-nums text-teal-950">
        {formatNum(r.monthTranCount)}
      </td>
      <td className="whitespace-nowrap bg-teal-50/40 px-3 py-2 text-right font-medium tabular-nums text-teal-950">
        {formatMoney(r.monthChargeCost)}
      </td>
    </tr>
  );
}

function SubtotalRow({
  label,
  p1TranCount,
  p1ChargeCost,
  p2TranCount,
  p2ChargeCost,
  monthTranCount,
  monthChargeCost,
  compensation,
  showPeriods,
  className,
}: {
  label: string;
  p1TranCount: number;
  p1ChargeCost: number;
  p2TranCount: number;
  p2ChargeCost: number;
  monthTranCount: number;
  monthChargeCost: number;
  compensation: number;
  showPeriods: boolean;
  className: string;
}) {
  if (!showPeriods) {
    return (
      <tr className={`border-t border-slate-200 ${className}`}>
        <td className="px-3 py-2" colSpan={2}>
          {label}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
          {formatNum(monthTranCount)}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
          {formatMoney(monthChargeCost)}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
          {formatMoney(compensation)}
        </td>
      </tr>
    );
  }

  return (
    <tr className={`border-t border-slate-200 ${className}`}>
      <td className="px-3 py-2" colSpan={2}>
        {label}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
        {formatNum(p1TranCount)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
        {formatMoney(p1ChargeCost)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
        {formatNum(p2TranCount)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
        {formatMoney(p2ChargeCost)}
      </td>
      <td className="whitespace-nowrap bg-teal-50/50 px-3 py-2 text-right tabular-nums">
        {formatNum(monthTranCount)}
      </td>
      <td className="whitespace-nowrap bg-teal-50/50 px-3 py-2 text-right tabular-nums">
        {formatMoney(monthChargeCost)}
      </td>
    </tr>
  );
}
