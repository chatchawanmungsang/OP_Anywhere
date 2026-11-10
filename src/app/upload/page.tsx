import { AppNav } from "@/components/app-nav";
import { RunNowButton } from "@/components/run-now-button";
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
    take: 15,
    include: { uploadedBy: { select: { name: true, email: true } } },
  });

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#ecfdf5_0%,_#f8fafc_45%,_#e2e8f0_100%)]">
      <AppNav activePath="/upload" />
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Upload Excel
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            อัปโหลดไฟล์ PROV SUM/DETAIL ระบุเดือนปีไทย งวด และตัวกรอง PROV1/PROV2
            — เลือกให้ Worker ประมวลผลทันที หรือประมวลผลตามตารางเวลาช่วงดึกได้
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
            <p className="font-semibold text-slate-900">SUM files</p>
            <p className="mt-1 text-slate-600">
              e.g. <code>PROV1_PROV2_RG07_SUM_6809_01.xlsx</code>
            </p>
            <p className="mt-2 text-teal-700">→ eclaim_transaction_summary (Sheet 1)</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
            <p className="font-semibold text-slate-900">DETAIL files</p>
            <p className="mt-1 text-slate-600">
              e.g. <code>PROV1_PROV2_RG07_DETAIL_6809_01.xlsx</code>
            </p>
            <p className="mt-2 text-teal-700">→ eclaim_transaction_data (Sheet 1 + 2)</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <UploadForm />
        </div>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">
            Recent uploads
          </h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">File</th>
                  <th className="px-3 py-3">ปี/เดือน/งวด</th>
                  <th className="px-3 py-3">PROV1/2</th>
                  <th className="px-3 py-3">Target</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Rows</th>
                  <th className="px-3 py-3">Scheduled</th>
                  <th className="px-3 py-3">Uploaded</th>
                  <th className="px-3 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                      No uploads yet.
                    </td>
                  </tr>
                ) : (
                  recent.map((b) => (
                    <tr key={b.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">{b.fileName}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {formatThaiPeriod(
                          b.dataYearThai,
                          b.dataMonthThai,
                          b.dataPeriod,
                        )}
                      </td>
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
                            <span className="mt-0.5 max-w-xs truncate text-xs text-red-600" title={b.errorMessage}>
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
                        {b.status === "SCHEDULED" &&
                        b.scheduledAt > new Date() ? (
                          <RunNowButton batchId={b.id} label="ประมวลผลทันที" />
                        ) : b.status === "FAILED" ? (
                          <RunNowButton batchId={b.id} label="ลองใหม่" />
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
