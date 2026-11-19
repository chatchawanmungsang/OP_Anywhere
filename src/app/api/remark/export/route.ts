import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SUMMARY_COLUMNS } from "@/lib/eclaim-schema";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toExcelCellValue(val: unknown): string | number | null {
  if (val === null || val === undefined) return "";
  if (typeof val === "bigint") return val.toString();
  if (typeof val === "number") return val;
  if (val instanceof Date) {
    return val.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
  }
  if (typeof val === "object" && "toNumber" in val && typeof (val as { toNumber: unknown }).toNumber === "function") {
    return (val as { toNumber: () => number }).toNumber();
  }
  if (typeof val === "object" && "toString" in val) {
    const s = String(val);
    const n = Number(s);
    return Number.isFinite(n) && s !== "" ? n : s;
  }
  return String(val);
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const year = Number(sp.get("year") ?? "");
  const month = Number(sp.get("month") ?? "");
  const periodRaw = sp.get("period") ?? "0";
  const period = periodRaw === "all" ? 0 : Number(periodRaw);
  const status = (sp.get("status") ?? "ALL").toUpperCase();
  const ruleCode = (sp.get("rule") ?? "").trim();
  const q = (sp.get("q") ?? "").trim();

  if (!Number.isFinite(year) || !Number.isFinite(month) || year < 2500 || month < 1 || month > 12) {
    return NextResponse.json(
      { error: "กรุณาระบุปี พ.ศ. และเดือนให้ถูกต้อง" },
      { status: 400 },
    );
  }

  const where: Prisma.EclaimTransactionSummaryWhereInput = {
    importYearThai: year,
    importMonthThai: month,
    ...(period === 1 || period === 2 ? { importPeriod: period } : {}),
  };

  if (status === "PASS") {
    where.remarkStatus = "PASS";
  } else if (status === "PRUNED_OUT") {
    where.remarkStatus = "PRUNED_OUT";
  } else if (status === "UNCHECKED") {
    where.remarkStatus = null;
  }

  if (ruleCode) {
    where.remarkRuleCode = ruleCode;
  }

  if (q) {
    where.OR = [
      { hcode: { contains: q, mode: "insensitive" } },
      { hn: { contains: q, mode: "insensitive" } },
      { hname: { contains: q, mode: "insensitive" } },
      { remarkNote: { contains: q, mode: "insensitive" } },
      { remarkRuleCode: { contains: q, mode: "insensitive" } },
      ...(/^\d+$/.test(q) ? [{ tranId: BigInt(q) }] : []),
    ];
  }

  const headers = [
    ...SUMMARY_COLUMNS.map((c) => c.excelHeader),
    "REMARK_STATUS",
    "REMARK_RULE_CODE",
    "REMARK_NOTE",
    "REMARKED_AT",
  ];

  const aoa: (string | number | null)[][] = [headers];
  const batchSize = 5000;
  let cursorId: string | undefined;

  while (true) {
    const batch = await prisma.eclaimTransactionSummary.findMany({
      where,
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });

    if (batch.length === 0) break;

    for (const row of batch) {
      const rec = row as unknown as Record<string, unknown>;
      const line: (string | number | null)[] = SUMMARY_COLUMNS.map((col) => {
        if (col.prismaField === "tranId") {
          return row.tranId != null ? row.tranId.toString() : "";
        }
        if (
          col.prismaField === "hcode" ||
          col.prismaField === "hmain2" ||
          col.prismaField === "hsubAf" ||
          col.prismaField === "hcodePaid" ||
          col.prismaField === "hn" ||
          col.prismaField === "rep"
        ) {
          return rec[col.prismaField] != null ? String(rec[col.prismaField]) : "";
        }
        return toExcelCellValue(rec[col.prismaField]);
      });

      line.push(
        row.remarkStatus ?? "UNCHECKED",
        row.remarkRuleCode ?? "",
        row.remarkNote ?? "",
        row.remarkedAt
          ? row.remarkedAt.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })
          : "",
      );
      aoa.push(line);
    }

    cursorId = batch[batch.length - 1]!.id;
    if (batch.length < batchSize) break;
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const sheetLabel =
    status === "PASS"
      ? "ผ่านการคัด (PASS)"
      : status === "PRUNED_OUT"
        ? "ไม่ผ่านคัดออก (PRUNED)"
        : "Summary_Remark";
  XLSX.utils.book_append_sheet(wb, ws, sheetLabel.slice(0, 31));

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const monthStr = String(month).padStart(2, "0");
  const periodStr = period === 1 || period === 2 ? `P${period}` : "ALL_PERIODS";
  const statusStr = status;
  const filename = `OP_SUMMARY_REMARK_${year}_${monthStr}_${periodStr}_${statusStr}.xlsx`;

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
