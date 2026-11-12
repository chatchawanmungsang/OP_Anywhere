import { Suspense } from "react";
import { UploadTarget, Prisma } from "@prisma/client";
import { AppNav } from "@/components/app-nav";
import { DataTable } from "@/components/data-table";
import {
  DetailReceipt,
  type ReceiptHeaderInfo,
  type ReceiptItemRow,
} from "@/components/detail-receipt";
import { EclaimToolbar } from "@/components/eclaim-toolbar";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { canDeleteData } from "@/lib/roles";
import { formatThaiPeriod } from "@/lib/import-metadata";
import {
  columnsForTarget,
  displayHeaders,
  type UploadTargetType,
} from "@/lib/eclaim-schema";

const PAGE_SIZE = 25;

const CONCISE_DETAIL_HEADERS = [
  "TRAN_ID",
  "HCODE",
  "HNAME",
  "DATEADM",
  "HN",
  "ITEM_CODE",
  "TMT_ID",
  "ITEM_NAME",
  "REQ_QTY",
  "PAID_QTY",
  "ราคากลาง",
  "ยอดเบิก",
  "ยอดจ่าย",
];

type Props = {
  target: UploadTarget;
  targetType: UploadTargetType;
  title: string;
  tableLabel: string;
  path: string;
  searchParams: Promise<{ q?: string; page?: string; tranId?: string }>;
};

function toDisplayValue(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object" && value !== null && "toString" in value) {
    return value.toString();
  }
  return value;
}

function toNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(String(value));
  return Number.isFinite(n) ? n : null;
}

export async function EclaimPage({
  target,
  targetType,
  title,
  tableLabel,
  path,
  searchParams,
}: Props) {
  const session = await requireSession();
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const rawTranId = (params.tranId ?? "").trim();
  const activeTranId =
    /^\d+$/.test(rawTranId)
      ? rawTranId
      : target === UploadTarget.DETAIL && /^\d{7,}$/.test(q)
        ? q
        : "";

  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const skip = (page - 1) * PAGE_SIZE;
  const columns = columnsForTarget(targetType);
  const headers =
    target === UploadTarget.DETAIL
      ? CONCISE_DETAIL_HEADERS
      : displayHeaders(targetType);

  if (target === UploadTarget.DETAIL && activeTranId) {
    const tranIdBigInt = BigInt(activeTranId);
    const [summaryRow, allDetailRows] = await Promise.all([
      prisma.eclaimTransactionSummary.findFirst({
        where: { tranId: tranIdBigInt },
        orderBy: { uploadedAt: "desc" },
      }),
      prisma.eclaimTransactionData.findMany({
        where: { tranId: tranIdBigInt },
        orderBy: [{ uploadedAt: "desc" }, { id: "asc" }],
      }),
    ]);

    const latestBatchId = allDetailRows[0]?.uploadBatchId;
    const detailRows = latestBatchId
      ? allDetailRows.filter((r) => r.uploadBatchId === latestBatchId)
      : allDetailRows;

    const firstDetail = detailRows[0];
    const yearThai =
      firstDetail?.importYearThai ?? summaryRow?.importYearThai ?? null;
    const monthThai =
      firstDetail?.importMonthThai ?? summaryRow?.importMonthThai ?? null;
    const period =
      firstDetail?.importPeriod ?? summaryRow?.importPeriod ?? null;

    const receiptHeader: ReceiptHeaderInfo = {
      tranId: activeTranId,
      hcode: summaryRow?.hcode ?? firstDetail?.hcode ?? null,
      hname: summaryRow?.hname ?? firstDetail?.hname ?? null,
      hsubAf: summaryRow?.hsubAf ?? firstDetail?.hsubAf ?? null,
      hsubAfName: summaryRow?.hsubAfName ?? firstDetail?.hsubAfName ?? null,
      dateadm: summaryRow?.dateadm ?? firstDetail?.dateadm ?? null,
      timeadm: summaryRow?.timeadm ?? firstDetail?.timeadm ?? null,
      dx: summaryRow?.dx ?? firstDetail?.sdxDiagnosis ?? null,
      pdx: summaryRow?.pdx ?? firstDetail?.pdx ?? null,
      pdxName: summaryRow?.pdxName ?? null,
      periodLabel:
        yearThai && monthThai && period
          ? formatThaiPeriod(yearThai, monthThai, period)
          : null,
      stmtPeriod: summaryRow?.stmtPeriod ?? firstDetail?.stmtPeriod ?? null,
      detailSourceFileName: firstDetail?.sourceFileName ?? null,
      summarySourceFileName: summaryRow?.sourceFileName ?? null,
      rep: summaryRow?.rep ?? null,
      hn: summaryRow?.hn ?? firstDetail?.hn ?? null,
      chargeCost: toNumberOrNull(summaryRow?.chargeCost),
      sumsCost: toNumberOrNull(summaryRow?.sumsCost),
    };

    const receiptItems: ReceiptItemRow[] = detailRows.map((r) => ({
      id: r.id,
      itemCode: r.itemCode,
      tmtId: r.tmtId,
      itemName: r.itemName,
      codeName: r.codeName,
      detailText: r.detail,
      sevGroup: r.sevGroup,
      drugUnit: r.drugUnit,
      dosageform: r.dosageform,
      reqQty: r.reqQty,
      paidQty: r.paidQty,
      unitPrice: toNumberOrNull(r.unitPrice),
      amountClaim: toNumberOrNull(r.amountClaim),
      amountPaid: toNumberOrNull(r.amountPaid),
    }));

    return (
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#ecfdf5_0%,_#f8fafc_45%,_#e2e8f0_100%)]">
        <AppNav activePath={path} />
        <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
          <DetailReceipt header={receiptHeader} items={receiptItems} />
        </main>
      </div>
    );
  }

  let rows: {
    id: string;
    sourceFileName: string;
    uploadedAt: Date;
    href?: string;
    record: Record<string, unknown>;
  }[] = [];
  let total = 0;

  if (target === UploadTarget.SUMMARY) {
    const where: Prisma.EclaimTransactionSummaryWhereInput = q
      ? {
          OR: [
            { hcode: { contains: q, mode: "insensitive" } },
            { hn: { contains: q, mode: "insensitive" } },
            { hname: { contains: q, mode: "insensitive" } },
            { sourceFileName: { contains: q, mode: "insensitive" } },
            ...(/^\d+$/.test(q) ? [{ tranId: BigInt(q) }] : []),
          ],
        }
      : {};

    const [data, count] = await Promise.all([
      prisma.eclaimTransactionSummary.findMany({
        where,
        orderBy: { uploadedAt: "desc" },
        skip,
        take: PAGE_SIZE,
      }),
      prisma.eclaimTransactionSummary.count({ where }),
    ]);
    total = count;
    rows = data.map((row) => ({
      id: row.id,
      sourceFileName: row.sourceFileName,
      uploadedAt: row.uploadedAt,
      href:
        row.tranId != null
          ? `/detail?tranId=${encodeURIComponent(row.tranId.toString())}`
          : undefined,
      record: Object.fromEntries(
        columns.map((c) => [
          c.excelHeader,
          toDisplayValue(
            (row as unknown as Record<string, unknown>)[c.prismaField],
          ),
        ]),
      ),
    }));
  } else {
    const where: Prisma.EclaimTransactionDataWhereInput = q
      ? {
          OR: [
            { hcode: { contains: q, mode: "insensitive" } },
            { hn: { contains: q, mode: "insensitive" } },
            { hname: { contains: q, mode: "insensitive" } },
            { itemCode: { contains: q, mode: "insensitive" } },
            { itemName: { contains: q, mode: "insensitive" } },
            { sourceFileName: { contains: q, mode: "insensitive" } },
            ...(/^\d+$/.test(q) ? [{ tranId: BigInt(q) }] : []),
          ],
        }
      : {};

    const [data, count] = await Promise.all([
      prisma.eclaimTransactionData.findMany({
        where,
        orderBy: { uploadedAt: "desc" },
        skip,
        take: PAGE_SIZE,
      }),
      prisma.eclaimTransactionData.count({ where }),
    ]);
    total = count;
    rows = data.map((row) => ({
      id: row.id,
      sourceFileName: row.sourceFileName,
      uploadedAt: row.uploadedAt,
      href:
        row.tranId != null
          ? `/detail?tranId=${encodeURIComponent(row.tranId.toString())}`
          : undefined,
      record: Object.fromEntries(
        columns.map((c) => [
          c.excelHeader,
          toDisplayValue(
            (row as unknown as Record<string, unknown>)[c.prismaField],
          ),
        ]),
      ),
    }));
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#ecfdf5_0%,_#f8fafc_45%,_#e2e8f0_100%)]">
      <AppNav activePath={path} />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Table: <code className="text-teal-800">{tableLabel}</code> ·{" "}
            <span className="font-medium text-teal-800">
              คลิกที่แถวเพื่อเปิดมุมมองใบเสร็จรายการรักษา (Detail) ของ TRAN_ID นั้น
            </span>
          </p>
        </div>

        <Suspense fallback={null}>
          <EclaimToolbar
            target={target}
            canDelete={canDeleteData(session.user.role)}
            total={total}
            page={page}
            pageSize={PAGE_SIZE}
            search={q}
            pagePath={path}
            tableLabel={tableLabel}
          />
        </Suspense>

        <DataTable
          headers={headers}
          rows={rows.map((r) => ({
            id: r.id,
            data: r.record,
            sourceFileName: r.sourceFileName,
            uploadedAt: r.uploadedAt.toISOString(),
            href: r.href,
          }))}
          emptyMessage={
            total === 0
              ? "No data yet. Upload a SUM or DETAIL Excel file to import."
              : "No rows match your search."
          }
        />
      </main>
    </div>
  );
}
