import { Suspense } from "react";
import { UploadTarget, Prisma, Role } from "@prisma/client";
import { DataTable } from "@/components/data-table";
import {
  DetailReceipt,
  type ReceiptHeaderInfo,
  type ReceiptItemRow,
} from "@/components/detail-receipt";
import { EclaimToolbar } from "@/components/eclaim-toolbar";
import { PageShell } from "@/components/page-shell";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { formatThaiPeriod, THAI_MONTHS } from "@/lib/import-metadata";
import {
  columnsForTarget,
  displayHeaders,
  type UploadTargetType,
} from "@/lib/eclaim-schema";

const PAGE_SIZE = 25;

type Props = {
  target: UploadTarget;
  targetType: UploadTargetType;
  title: string;
  tableLabel: string;
  path: string;
  searchParams: Promise<{
    q?: string;
    page?: string;
    tranId?: string;
    year?: string;
    month?: string;
    affiliation?: string;
    hcode?: string;
  }>;
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

function padHcode(code: string): string {
  const t = code.trim();
  return /^\d+$/.test(t) ? t.padStart(5, "0") : t;
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
  const activeTranId = /^\d+$/.test(rawTranId) ? rawTranId : "";

  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const skip = (page - 1) * PAGE_SIZE;
  const columns = columnsForTarget(targetType);
  const headers = displayHeaders(targetType);

  const isManager = session.user.role === Role.MANAGER;
  const lockedHcode = isManager ? session.user.hcode : null;
  const lockedHname = isManager ? session.user.hname : null;

  if (target === UploadTarget.DETAIL && activeTranId) {
    const tranIdBigInt = BigInt(activeTranId);
    const summaryWhere: Prisma.EclaimTransactionSummaryWhereInput = {
      tranId: tranIdBigInt,
      ...(lockedHcode
        ? { hcode: { equals: padHcode(lockedHcode), mode: "insensitive" } }
        : {}),
    };

    const [summaryRow, allDetailRows] = await Promise.all([
      prisma.eclaimTransactionSummary.findFirst({
        where: summaryWhere,
        orderBy: { uploadedAt: "desc" },
      }),
      prisma.eclaimTransactionData.findMany({
        where: {
          tranId: tranIdBigInt,
          ...(lockedHcode
            ? { hcode: { equals: padHcode(lockedHcode), mode: "insensitive" } }
            : {}),
        },
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

    const receiptItems = detailRows.map((r) => ({
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
    })) satisfies ReceiptItemRow[];

    return (
      <PageShell activePath="/summary">
        <DetailReceipt header={receiptHeader} items={receiptItems} />
      </PageShell>
    );
  }

  // Summary list with filters
  const monthGroups = await prisma.eclaimTransactionSummary.groupBy({
    by: ["importYearThai", "importMonthThai"],
    orderBy: [{ importYearThai: "desc" }, { importMonthThai: "desc" }],
  });
  const months = monthGroups.map((g) => {
    const monthLabel =
      THAI_MONTHS.find((m) => m.value === g.importMonthThai)?.label ??
      String(g.importMonthThai);
    return {
      yearThai: g.importYearThai,
      monthThai: g.importMonthThai,
      label: `${monthLabel} ${g.importYearThai}`,
    };
  });

  const selectedYear = (params.year ?? "").trim();
  const selectedMonth = (params.month ?? "").trim();
  let selectedHcode = lockedHcode
    ? padHcode(lockedHcode)
    : (params.hcode ?? "").trim();
  let selectedAffiliation = (params.affiliation ?? "").trim();

  if (lockedHcode) {
    const office = await prisma.refHealthOffice.findUnique({
      where: { hcode: padHcode(lockedHcode) },
      select: { affiliation: true, name: true },
    });
    if (office?.affiliation) selectedAffiliation = office.affiliation;
  }

  // Units / affiliations for combos (scoped by month when selected)
  const unitWhere: Prisma.EclaimTransactionSummaryWhereInput = {};
  if (selectedYear) unitWhere.importYearThai = Number(selectedYear);
  if (selectedMonth) unitWhere.importMonthThai = Number(selectedMonth);

  const distinctUnits = await prisma.eclaimTransactionSummary.findMany({
    where: unitWhere,
    distinct: ["hcode"],
    select: { hcode: true, hname: true },
    orderBy: { hcode: "asc" },
    take: 5000,
  });

  const units = distinctUnits
    .filter((u) => u.hcode)
    .map((u) => ({
      hcode: u.hcode!,
      hname: u.hname ?? "",
    }))
    .sort((a, b) => a.hcode.localeCompare(b.hcode, "th"));

  const offices = await prisma.refHealthOffice.findMany({
    where: {
      hcode: { in: units.map((u) => padHcode(u.hcode)) },
    },
    select: { hcode: true, affiliation: true },
  });
  const affilSet = new Set(
    offices
      .map((o) => o.affiliation?.trim())
      .filter((a): a is string => Boolean(a)),
  );
  const affiliations = Array.from(affilSet)
    .sort((a, b) => a.localeCompare(b, "th"))
    .map((a) => ({ value: a, label: a }));

  // Filter hcodes by affiliation if needed
  let hcodesForAffil: string[] | null = null;
  if (selectedAffiliation && !lockedHcode) {
    const affOffices = await prisma.refHealthOffice.findMany({
      where: { affiliation: selectedAffiliation },
      select: { hcode: true },
    });
    hcodesForAffil = affOffices.map((o) => o.hcode);
  }

  const where: Prisma.EclaimTransactionSummaryWhereInput = {
    AND: [
      selectedYear ? { importYearThai: Number(selectedYear) } : {},
      selectedMonth ? { importMonthThai: Number(selectedMonth) } : {},
      selectedHcode
        ? { hcode: { equals: padHcode(selectedHcode), mode: "insensitive" } }
        : {},
      hcodesForAffil
        ? {
            OR: hcodesForAffil.map((hc) => ({
              hcode: { equals: hc, mode: "insensitive" as const },
            })),
          }
        : {},
      q
        ? {
            OR: [
              { hcode: { contains: q, mode: "insensitive" } },
              { hn: { contains: q, mode: "insensitive" } },
              { hname: { contains: q, mode: "insensitive" } },
              { sourceFileName: { contains: q, mode: "insensitive" } },
              ...(/^\d+$/.test(q) ? [{ tranId: BigInt(q) }] : []),
            ],
          }
        : {},
    ],
  };

  // For manager without hcode, show nothing
  if (isManager && !lockedHcode) {
    where.AND = [{ hcode: { equals: "__no_unit_assigned__" } }];
  }

  const filteredUnits =
    selectedAffiliation && !lockedHcode && hcodesForAffil
      ? units.filter((u) =>
          hcodesForAffil!.some(
            (hc) => padHcode(hc) === padHcode(u.hcode),
          ),
        )
      : units;

  const [data, count] = await Promise.all([
    prisma.eclaimTransactionSummary.findMany({
      where,
      orderBy: { uploadedAt: "desc" },
      skip,
      take: PAGE_SIZE,
    }),
    prisma.eclaimTransactionSummary.count({ where }),
  ]);

  const rows = data.map((row) => ({
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

  return (
    <PageShell
      activePath={path}
      header={
        <>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {title}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Table: <code className="text-teal-800">{tableLabel}</code> ·{" "}
              <span className="font-medium text-teal-800">
                คลิก TRAN_ID เพื่อเปิดมุมมองใบเสร็จรายการรักษา
              </span>
            </p>
          </div>
          <Suspense fallback={null}>
            <EclaimToolbar
              total={count}
              page={page}
              pageSize={PAGE_SIZE}
              search={q}
              pagePath={path}
              months={months}
              affiliations={affiliations}
              units={filteredUnits}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              selectedAffiliation={selectedAffiliation}
              selectedHcode={selectedHcode}
              lockUnit={isManager}
              lockedHcode={lockedHcode}
              lockedHname={lockedHname}
            />
          </Suspense>
        </>
      }
    >
      <DataTable
        stickyHeader
        className="min-h-0 flex-1"
        headers={headers}
        rows={rows.map((r) => ({
          id: r.id,
          data: r.record,
          sourceFileName: r.sourceFileName,
          uploadedAt: r.uploadedAt.toISOString(),
          href: r.href,
        }))}
        emptyMessage={
          count === 0
            ? isManager && !lockedHcode
              ? "บัญชี Manager ยังไม่ได้กำหนดหน่วยบริการ"
              : "ไม่พบข้อมูลตามเงื่อนไขที่เลือก"
            : "No rows match your search."
        }
      />
    </PageShell>
  );
}
