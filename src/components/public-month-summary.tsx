"use client";

import { Fragment } from "react";
import { useRouter } from "next/navigation";
import type {
  CrosstabResult,
  MonthOption,
} from "@/lib/public-summary-stats";
import {
  StickyTableFrame,
  stickyThClass,
  stickyTheadClass,
} from "@/components/sticky-table-frame";

type Props = {
  months: MonthOption[];
  selectedYear: number | null;
  selectedMonth: number | null;
  crosstab: CrosstabResult;
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

export function PublicMonthSummary({
  months,
  selectedYear,
  selectedMonth,
  crosstab,
}: Props) {
  const router = useRouter();
  const { groups, totals } = crosstab;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-teal-800">
            OP Anywhere
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            สรุปจำนวนรายการตามหน่วยที่รักษา
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            แยกตามต้นสังกัด · HCODE / HNAME · งวด 1 / งวด 2 / รวมเดือน · ไม่ต้องเข้าสู่ระบบ
          </p>
        </div>
        <a
          href="/login"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          เข้าสู่ระบบ
        </a>
      </div>

      <form
        className="flex shrink-0 flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const value = String(fd.get("monthKey") ?? "");
          if (!value) {
            router.push("/");
            return;
          }
          const [y, m] = value.split("-");
          router.push(`/?year=${y}&month=${m}`);
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
              <tr>
                <th
                  rowSpan={2}
                  className={`${stickyThClass} border-b border-slate-200`}
                >
                  HCODE
                </th>
                <th
                  rowSpan={2}
                  className={`${stickyThClass} border-b border-slate-200`}
                >
                  HNAME
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
                <th
                  className={`${stickyThClass} border-b border-slate-200 text-right`}
                >
                  จำนวน TRAN_ID
                </th>
                <th
                  className={`${stickyThClass} border-b border-slate-200 text-right`}
                >
                  CHARGE_COST
                </th>
                <th
                  className={`${stickyThClass} border-b border-slate-200 text-right`}
                >
                  จำนวน TRAN_ID
                </th>
                <th
                  className={`${stickyThClass} border-b border-slate-200 text-right`}
                >
                  CHARGE_COST
                </th>
                <th
                  className={`${stickyThClass} border-b border-slate-200 bg-teal-50 text-right text-teal-900`}
                >
                  จำนวน TRAN_ID
                </th>
                <th
                  className={`${stickyThClass} border-b border-slate-200 bg-teal-50 text-right text-teal-900`}
                >
                  CHARGE_COST
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={group.affiliation}>
                  <tr className="bg-slate-100/90">
                    <td
                      colSpan={8}
                      className="px-3 py-2 text-sm font-semibold text-slate-800"
                    >
                      ต้นสังกัด: {group.affiliation}
                      <span className="ml-2 font-normal text-slate-500">
                        ({formatNum(group.rows.length)} หน่วย)
                      </span>
                    </td>
                  </tr>
                  {group.rows.map((r) => (
                    <tr
                      key={`${group.affiliation}-${r.hcode}`}
                      className="border-t border-slate-100 hover:bg-slate-50/80"
                    >
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">
                        {r.hcode}
                      </td>
                      <td className="max-w-xs truncate px-3 py-2 text-slate-700">
                        {r.hname}
                      </td>
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
                  ))}
                  <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                    <td className="px-3 py-2" colSpan={2}>
                      รวมต้นสังกัด {group.affiliation}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {formatNum(group.p1TranCount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {formatMoney(group.p1ChargeCost)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {formatNum(group.p2TranCount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {formatMoney(group.p2ChargeCost)}
                    </td>
                    <td className="whitespace-nowrap bg-teal-50/50 px-3 py-2 text-right tabular-nums">
                      {formatNum(group.monthTranCount)}
                    </td>
                    <td className="whitespace-nowrap bg-teal-50/50 px-3 py-2 text-right tabular-nums">
                      {formatMoney(group.monthChargeCost)}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
            {groups.length > 0 ? (
              <tfoot className="sticky bottom-0 z-10 bg-teal-100 font-semibold text-teal-950 shadow-[0_-1px_0_0_rgba(15,23,42,0.08)]">
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
              </tfoot>
            ) : null}
          </table>
        </StickyTableFrame>
      )}
    </div>
  );
}
