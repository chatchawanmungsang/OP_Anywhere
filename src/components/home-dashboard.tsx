"use client";

import { useRouter } from "next/navigation";
import type {
  DashboardPayload,
  MetricDelta,
  MonthOption,
} from "@/lib/report-types";

function formatNum(n: number): string {
  return n.toLocaleString("th-TH");
}

function formatMoney(n: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function deltaText(d: MetricDelta, money = false): string {
  if (d.direction === "new") return "เทียบเดือนก่อนไม่ได้";
  if (d.direction === "flat") return "เท่ากับเดือนก่อน";
  const sign = d.diff > 0 ? "+" : "";
  const abs = money ? formatMoney(Math.abs(d.diff)) : formatNum(Math.abs(d.diff));
  const pct =
    d.pct == null
      ? d.previous === 0
        ? " (จากศูนย์)"
        : ""
      : ` (${sign}${d.pct.toFixed(1)}%)`;
  const word = d.diff > 0 ? "เพิ่มขึ้น" : "ลดลง";
  return `${word} ${abs}${pct} จากเดือนก่อน`;
}

function deltaClass(d: MetricDelta): string {
  if (d.direction === "up") return "text-emerald-700";
  if (d.direction === "down") return "text-rose-700";
  return "text-slate-500";
}

function SummaryCard({
  title,
  value,
  delta,
  money,
  footnote,
}: {
  title: string;
  value: string;
  delta: MetricDelta;
  money?: boolean;
  footnote?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
        {value}
      </p>
      <p className={`mt-2 text-xs font-medium ${deltaClass(delta)}`}>
        {deltaText(delta, money)}
      </p>
      {footnote ? (
        <p className="mt-1 text-[11px] text-slate-400">{footnote}</p>
      ) : null}
    </div>
  );
}

function BarPairChart({
  title,
  currentP1,
  currentP2,
  prevP1,
  prevP2,
  currentLabel,
  previousLabel,
  money,
}: {
  title: string;
  currentP1: number;
  currentP2: number;
  prevP1: number;
  prevP2: number;
  currentLabel: string;
  previousLabel: string | null;
  money?: boolean;
}) {
  const max = Math.max(currentP1, currentP2, prevP1, prevP2, 1);
  const fmt = money ? formatMoney : formatNum;
  const bars = [
    { label: `${currentLabel} · งวด1`, value: currentP1, color: "#0f766e" },
    { label: `${currentLabel} · งวด2`, value: currentP2, color: "#14b8a6" },
    ...(previousLabel
      ? [
          {
            label: `${previousLabel} · งวด1`,
            value: prevP1,
            color: "#64748b",
          },
          {
            label: `${previousLabel} · งวด2`,
            value: prevP2,
            color: "#94a3b8",
          },
        ]
      : []),
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-4 space-y-3">
        {bars.map((b) => (
          <div key={b.label}>
            <div className="mb-1 flex justify-between text-xs text-slate-600">
              <span>{b.label}</span>
              <span className="font-medium tabular-nums text-slate-800">
                {fmt(b.value)}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(2, (b.value / max) * 100)}%`,
                  backgroundColor: b.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendChart({
  title,
  trend,
  mode,
}: {
  title: string;
  trend: DashboardPayload["trend"];
  mode: "visits" | "charge";
}) {
  const values = trend.map((t) =>
    mode === "visits" ? t.monthVisits : t.monthCharge,
  );
  const max = Math.max(...values, 1);
  const w = 560;
  const h = 180;
  const padX = 28;
  const padY = 20;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;

  const points = values.map((v, i) => {
    const x =
      values.length <= 1
        ? padX + innerW / 2
        : padX + (i / (values.length - 1)) * innerW;
    const y = padY + innerH - (v / max) * innerH;
    return { x, y, v, label: trend[i]?.label ?? "" };
  });

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {trend.length === 0 ? (
        <p className="mt-8 text-center text-sm text-slate-500">ยังไม่มีข้อมูล</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <svg viewBox={`0 0 ${w} ${h}`} className="h-44 w-full min-w-[320px]">
            <line
              x1={padX}
              y1={padY + innerH}
              x2={padX + innerW}
              y2={padY + innerH}
              stroke="#e2e8f0"
            />
            <path d={path} fill="none" stroke="#0f766e" strokeWidth="2.5" />
            {points.map((p) => (
              <g key={p.label}>
                <circle cx={p.x} cy={p.y} r="3.5" fill="#0f766e" />
              </g>
            ))}
          </svg>
          <div className="mt-1 flex justify-between gap-1 text-[10px] text-slate-500">
            {trend.map((t) => (
              <span key={t.label} className="truncate text-center">
                {t.label.replace(" ", "\n")}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type Props = {
  data: DashboardPayload;
};

export function HomeDashboard({ data }: Props) {
  const router = useRouter();
  const {
    months,
    selectedYear,
    selectedMonth,
    selectedLabel,
    previousLabel,
    current,
    previous,
    cards,
    periodCards,
  } = data;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          แดชบอร์ดสรุปรายเดือน
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          การ์ดและกราฟสรุป Visit · ค่าบริการ · หน่วยบริการ · เงินชดเชย ·
          เปรียบเทียบเดือนก่อน
        </p>
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
            defaultValue={`${selectedYear}-${selectedMonth}`}
            className="mt-1 block min-w-[220px] rounded-lg border border-slate-300 px-3 py-2"
          >
            {months.length === 0 ? (
              <option value="">ยังไม่มีข้อมูล</option>
            ) : (
              months.map((m: MonthOption) => (
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
        <p className="pb-2 text-xs text-slate-500">
          เดือนที่เลือก: <span className="font-medium">{selectedLabel}</span>
          {previousLabel ? (
            <>
              {" "}
              · เทียบกับ <span className="font-medium">{previousLabel}</span>
            </>
          ) : null}
        </p>
      </form>

      {months.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-slate-500">
          ยังไม่มีข้อมูล Summary ในระบบ
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="Visit รวมเดือน"
              value={formatNum(cards.visits.current)}
              delta={cards.visits}
            />
            <SummaryCard
              title="ค่าบริการ(บาท) รวมเดือน"
              value={formatMoney(cards.charge.current)}
              delta={cards.charge}
              money
            />
            <SummaryCard
              title="จำนวนหน่วยที่ให้บริการ"
              value={formatNum(cards.units.current)}
              delta={cards.units}
            />
            <SummaryCard
              title="จำนวนเงินที่จ่ายชดเชย(บาท)"
              value={formatMoney(cards.compensation.current)}
              delta={cards.compensation}
              money
              footnote="ขณะนี้ยังเป็น 0.00 (รอข้อมูลชดเชย)"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="Visit งวด 1"
              value={formatNum(periodCards.p1Visits.current)}
              delta={periodCards.p1Visits}
            />
            <SummaryCard
              title="Visit งวด 2"
              value={formatNum(periodCards.p2Visits.current)}
              delta={periodCards.p2Visits}
            />
            <SummaryCard
              title="ค่าบริการ งวด 1"
              value={formatMoney(periodCards.p1Charge.current)}
              delta={periodCards.p1Charge}
              money
            />
            <SummaryCard
              title="ค่าบริการ งวด 2"
              value={formatMoney(periodCards.p2Charge.current)}
              delta={periodCards.p2Charge}
              money
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <BarPairChart
              title="เปรียบเทียบ Visit แยกงวด"
              currentP1={current.p1Visits}
              currentP2={current.p2Visits}
              prevP1={previous?.p1Visits ?? 0}
              prevP2={previous?.p2Visits ?? 0}
              currentLabel={selectedLabel}
              previousLabel={previousLabel}
            />
            <BarPairChart
              title="เปรียบเทียบค่าบริการ แยกงวด"
              currentP1={current.p1Charge}
              currentP2={current.p2Charge}
              prevP1={previous?.p1Charge ?? 0}
              prevP2={previous?.p2Charge ?? 0}
              currentLabel={selectedLabel}
              previousLabel={previousLabel}
              money
            />
            <TrendChart
              title="แนวโน้ม Visit รวมเดือน"
              trend={data.trend}
              mode="visits"
            />
            <TrendChart
              title="แนวโน้มค่าบริการรวมเดือน"
              trend={data.trend}
              mode="charge"
            />
          </div>
        </>
      )}
    </div>
  );
}
