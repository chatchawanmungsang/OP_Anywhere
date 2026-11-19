import { DeleteBatchButton } from "@/components/delete-batch-button";
import { PageShell } from "@/components/page-shell";
import { RunNowButton } from "@/components/run-now-button";
import {
  StickyTableFrame,
  stickyThClass,
  stickyTheadClass,
} from "@/components/sticky-table-frame";
import { UploadForm } from "@/components/upload-form";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { canUpload } from "@/lib/roles";
import { formatThaiPeriod } from "@/lib/import-metadata";
import { redirect } from "next/navigation";

function statusClass(status: string): string {
  switch (status) {
    case "SUCCESS":
      return "text-emerald-700";
    case "FAILED":
      return "text-red-700";
    case "PROCESSING":
      return "text-amber-700";
    case "SCHEDULED":
      return "text-blue-700";
    case "CANCELLED":
      return "text-slate-500";
    default:
      return "text-slate-700";
  }
}

export default async function UploadPage() {
  const session = await requireSession();
  if (!canUpload(session.user.role)) {
    redirect("/summary");
  }

  const recent = await prisma.uploadBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { uploadedBy: { select: { name: true, email: true } } },
  });

  const successWarnings = recent.filter(
    (b) => b.status === "SUCCESS" && b.warningMessage,
  );

  return (
    <PageShell
      activePath="/upload"
      header={
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Upload Excel
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            อัปโหลดไฟล์ PROV SUM/DETAIL ระบุเดือนปีไทย งวด และตัวกรอง PROV1/PROV2
            — ตรวจไฟล์ซ้ำกับที่เคยนำเข้าสำเร็จ และลบข้อมูลงวดได้จากตารางด้านล่าง
          </p>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="max-h-[42vh] shrink-0 space-y-3 overflow-y-auto">
          {successWarnings.length > 0 ? (
            <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-950">
                แจ้งเตือน: พบข้อมูล Summary ซ้ำหลังนำเข้า
              </p>
              {successWarnings.map((b) => (
                <p key={b.id} className="text-sm text-amber-900">
                  <span className="font-medium">{b.fileName}</span> —{" "}
                  {b.warningMessage}
                </p>
              ))}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
              <p className="font-semibold text-slate-900">SUM files</p>
              <p className="mt-1 text-slate-600">
                e.g. <code>PROV1_PROV2_RG07_SUM_6809_01.xlsx</code>
              </p>
              <p className="mt-1 text-teal-700">
                → eclaim_transaction_summary
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
              <p className="font-semibold text-slate-900">DETAIL files</p>
              <p className="mt-1 text-slate-600">
                e.g. <code>PROV1_PROV2_RG07_DETAIL_6809_01.xlsx</code>
              </p>
              <p className="mt-1 text-teal-700">
                → eclaim_transaction_data
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <UploadForm />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <h2 className="shrink-0 text-lg font-semibold text-slate-900">
            Recent uploads
          </h2>
          <StickyTableFrame
            empty={recent.length === 0}
            emptyMessage="No uploads yet."
          >
            <table className="min-w-full text-left text-sm">
              <thead className={stickyTheadClass}>
                <tr>
                  <th className={stickyThClass}>File</th>
                  <th className={stickyThClass}>ปี/เดือน/งวด</th>
                  <th className={stickyThClass}>PROV1/2</th>
                  <th className={stickyThClass}>Target</th>
                  <th className={stickyThClass}>Status</th>
                  <th className={stickyThClass}>Rows</th>
                  <th className={stickyThClass}>Scheduled</th>
                  <th className={stickyThClass}>Uploaded</th>
                  <th className={stickyThClass}>Action</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((b) => {
                  const periodLabel = formatThaiPeriod(
                    b.dataYearThai,
                    b.dataMonthThai,
                    b.dataPeriod,
                  );
                  return (
                    <tr key={b.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <div>{b.fileName}</div>
                        {b.warningMessage ? (
                          <div
                            className="mt-1 max-w-xs text-xs text-amber-700"
                            title={b.warningMessage}
                          >
                            ⚠ {b.warningMessage}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{periodLabel}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {b.filterProv1}/{b.filterProv2}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {b.target ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col">
                          <span
                            className={statusClass(b.status)}
                            title={b.errorMessage ?? undefined}
                          >
                            {b.status}
                            {b.status === "PROCESSING" && b.progressRows > 0
                              ? ` (${b.progressRows})`
                              : ""}
                          </span>
                          {b.status === "FAILED" && b.errorMessage ? (
                            <span
                              className="mt-0.5 max-w-xs truncate text-xs text-red-600"
                              title={b.errorMessage}
                            >
                              {b.errorMessage}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {b.rowCount}
                        {b.rowsSkipped > 0 ? (
                          <span className="text-xs text-slate-400">
                            {" "}
                            (skip {b.rowsSkipped})
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {b.scheduledAt.toLocaleString("th-TH", {
                          timeZone: "Asia/Bangkok",
                        })}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {b.createdAt.toLocaleString("th-TH", {
                          timeZone: "Asia/Bangkok",
                        })}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          {b.status === "SCHEDULED" &&
                          b.scheduledAt > new Date() ? (
                            <RunNowButton
                              batchId={b.id}
                              label="ประมวลผลทันที"
                            />
                          ) : null}
                          {b.status === "FAILED" ? (
                            <RunNowButton batchId={b.id} label="ลองใหม่" />
                          ) : null}
                          {b.status === "SUCCESS" ? (
                            <DeleteBatchButton
                              batchId={b.id}
                              label={`${b.target ?? ""} ${periodLabel}`}
                            />
                          ) : null}
                          {b.status !== "SUCCESS" &&
                          b.status !== "FAILED" &&
                          !(
                            b.status === "SCHEDULED" &&
                            b.scheduledAt > new Date()
                          ) ? (
                            <span className="text-xs text-slate-400">—</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </StickyTableFrame>
        </div>
      </div>
    </PageShell>
  );
}
