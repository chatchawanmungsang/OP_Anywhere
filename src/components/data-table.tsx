"use client";

import { useRouter } from "next/navigation";

type Props = {
  headers: string[];
  rows: {
    id: string;
    data: Record<string, unknown>;
    sourceFileName: string;
    uploadedAt: string;
    href?: string;
  }[];
  emptyMessage?: string;
};

export function DataTable({ headers, rows, emptyMessage }: Props) {
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-slate-500">
        {emptyMessage ?? "No data to display."}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {headers.map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-3 font-semibold">
                {h}
              </th>
            ))}
            <th className="whitespace-nowrap px-3 py-3 font-semibold">Source</th>
            <th className="whitespace-nowrap px-3 py-3 font-semibold">Uploaded</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isClickable = Boolean(row.href);
            return (
              <tr
                key={row.id}
                onClick={() => {
                  if (row.href) {
                    router.push(row.href);
                  }
                }}
                title={
                  isClickable
                    ? "คลิกเพื่อดูรายละเอียดใบเสร็จรายการรักษา (Detail)"
                    : undefined
                }
                className={`border-t border-slate-100 transition-colors ${
                  isClickable
                    ? "cursor-pointer hover:bg-teal-50/70 active:bg-teal-100/60"
                    : "hover:bg-slate-50/80"
                }`}
              >
                {headers.map((h) => {
                  const cellText = formatCell(row.data[h]);
                  if (h === "TRAN_ID" && row.href && cellText) {
                    return (
                      <td
                        key={h}
                        className="whitespace-nowrap px-3 py-2 font-medium text-teal-700 underline decoration-teal-300 underline-offset-2"
                      >
                        {cellText}
                      </td>
                    );
                  }
                  return (
                    <td
                      key={h}
                      className="max-w-xs truncate px-3 py-2 text-slate-800"
                    >
                      {cellText}
                    </td>
                  );
                })}
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                  {row.sourceFileName}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                  {new Date(row.uploadedAt).toLocaleString("th-TH", {
                    timeZone: "Asia/Bangkok",
                  })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object" && value !== null && "toString" in value) {
    return value.toString();
  }
  return String(value);
}
