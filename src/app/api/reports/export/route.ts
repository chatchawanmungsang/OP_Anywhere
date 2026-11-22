import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  flattenCrosstabForExport,
  formatExportFileBase,
  getReportCrosstab,
  type ReportKind,
} from "@/lib/public-summary-stats";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const kind = (searchParams.get("kind") ?? "hcode") as ReportKind;
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  const format = (searchParams.get("format") ?? "xlsx").toLowerCase();

  if (!["hcode", "hmain", "payment"].includes(kind)) {
    return NextResponse.json({ ok: false, message: "Invalid kind" }, { status: 400 });
  }
  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json(
      { ok: false, message: "Invalid year/month" },
      { status: 400 },
    );
  }

  const crosstab = await getReportCrosstab(kind, year, month);
  const rows = flattenCrosstabForExport(kind, crosstab);
  const base = formatExportFileBase(year, month);

  if (format === "csv") {
    const ws = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const bom = "\uFEFF";
    return new NextResponse(bom + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(base + ".csv")}`,
      },
    });
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "สรุป");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(base + ".xlsx")}`,
    },
  });
}
