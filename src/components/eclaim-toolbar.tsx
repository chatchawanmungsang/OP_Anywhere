"use client";

import { useRouter, useSearchParams } from "next/navigation";

type MonthOption = { yearThai: number; monthThai: number; label: string };
type AffilOption = { value: string; label: string };
type UnitOption = { hcode: string; hname: string };

type Props = {
  total: number;
  page: number;
  pageSize: number;
  search: string;
  pagePath: string;
  months: MonthOption[];
  affiliations: AffilOption[];
  units: UnitOption[];
  selectedYear: string;
  selectedMonth: string;
  selectedAffiliation: string;
  selectedHcode: string;
  lockUnit: boolean;
  lockedHcode: string | null;
  lockedHname: string | null;
};

export function EclaimToolbar({
  total,
  page,
  pageSize,
  search,
  pagePath,
  months,
  affiliations,
  units,
  selectedYear,
  selectedMonth,
  selectedAffiliation,
  selectedHcode,
  lockUnit,
  lockedHcode,
  lockedHname,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function updateQuery(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([k, v]) => {
      if (!v) params.delete(k);
      else params.set(k, v);
    });
    router.push(`${pagePath}?${params.toString()}`);
  }

  const monthKey =
    selectedYear && selectedMonth
      ? `${selectedYear}-${selectedMonth}`
      : months[0]
        ? `${months[0].yearThai}-${months[0].monthThai}`
        : "";

  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const monthVal = String(fd.get("monthKey") ?? "");
          const [y, m] = monthVal.split("-");
          updateQuery({
            year: y || "",
            month: m || "",
            affiliation: lockUnit
              ? selectedAffiliation
              : String(fd.get("affiliation") ?? ""),
            hcode: lockUnit
              ? lockedHcode ?? ""
              : String(fd.get("hcode") ?? ""),
            q: String(fd.get("q") ?? ""),
            page: "1",
          });
        }}
      >
        <label className="text-sm">
          <span className="font-medium text-slate-700">เดือน</span>
          <select
            name="monthKey"
            defaultValue={monthKey}
            className="mt-1 block min-w-[180px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">ทั้งหมด</option>
            {months.map((m) => (
              <option
                key={`${m.yearThai}-${m.monthThai}`}
                value={`${m.yearThai}-${m.monthThai}`}
              >
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="font-medium text-slate-700">สังกัด</span>
          <select
            name="affiliation"
            defaultValue={selectedAffiliation}
            disabled={lockUnit}
            className="mt-1 block min-w-[180px] rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
          >
            <option value="">ทั้งหมด</option>
            {affiliations.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="font-medium text-slate-700">หน่วยให้บริการ</span>
          {lockUnit ? (
            <div className="mt-1 min-w-[220px] rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-800">
              <span className="font-mono font-semibold">{lockedHcode}</span>{" "}
              {lockedHname}
            </div>
          ) : (
            <select
              name="hcode"
              defaultValue={selectedHcode}
              className="mt-1 block min-w-[220px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">ทั้งหมด</option>
              {units.map((u) => (
                <option key={u.hcode} value={u.hcode}>
                  {u.hcode} {u.hname}
                </option>
              ))}
            </select>
          )}
        </label>

        <input
          name="q"
          defaultValue={search}
          placeholder="ค้นหา HN, TRAN_ID, ชื่อหน่วย…"
          className="min-w-[200px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-teal-600/30 focus:ring-2"
        />
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          กรอง
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <span>
          {total.toLocaleString("th-TH")} รายการ · หน้า {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => updateQuery({ page: String(page - 1) })}
          className="rounded-md border border-slate-200 px-2 py-1 disabled:opacity-40"
        >
          Prev
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => updateQuery({ page: String(page + 1) })}
          className="rounded-md border border-slate-200 px-2 py-1 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
