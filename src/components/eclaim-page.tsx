import { Suspense } from "react";
import { UploadTarget, Prisma } from "@prisma/client";
import { AppNav } from "@/components/app-nav";
import { DataTable } from "@/components/data-table";
import { EclaimToolbar } from "@/components/eclaim-toolbar";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { canDeleteData } from "@/lib/roles";
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
  searchParams: Promise<{ q?: string; page?: string }>;
};

function toDisplayValue(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object" && value !== null && "toString" in value) {
    return value.toString();
  }
  return value;
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
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const skip = (page - 1) * PAGE_SIZE;
  const columns = columnsForTarget(targetType);
  const headers = displayHeaders(targetType);

  let rows: {
    id: string;
    sourceFileName: string;
    uploadedAt: Date;
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
            ...( /^\d+$/.test(q) ? [{ tranId: BigInt(q) }] : []),
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
            { sourceFileName: { contains: q, mode: "insensitive" } },
            ...( /^\d+$/.test(q) ? [{ tranId: BigInt(q) }] : []),
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
            Table: <code className="text-teal-800">{tableLabel}</code> · Sheet 1
            from SUM/DETAIL Excel files
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
          }))}
          emptyMessage={
            total === 0
              ? "No data yet. Upload a SUM or DETAIL Excel file to import Sheet 1."
              : "No rows match your search."
          }
        />
      </main>
    </div>
  );
}
