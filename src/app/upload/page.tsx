import { AppNav } from "@/components/app-nav";
import { UploadForm } from "@/components/upload-form";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { canUpload } from "@/lib/roles";
import { redirect } from "next/navigation";

export default async function UploadPage() {
  const session = await requireSession();
  if (!canUpload(session.user.role)) {
    redirect("/summary");
  }

  const recent = await prisma.uploadBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { uploadedBy: { select: { name: true, email: true } } },
  });

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#ecfdf5_0%,_#f8fafc_45%,_#e2e8f0_100%)]">
      <AppNav activePath="/upload" />
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Upload Excel
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Upload PROV SUM/DETAIL workbooks. Sheet 1 is validated against the
            SQL table schema and appended to PostgreSQL.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
            <p className="font-semibold text-slate-900">SUM files</p>
            <p className="mt-1 text-slate-600">
              e.g. <code>PROV1_PROV2_RG07_SUM_6809_01.xlsx</code>
            </p>
            <p className="mt-2 text-teal-700">→ eclaim_transaction_summary</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
            <p className="font-semibold text-slate-900">DETAIL files</p>
            <p className="mt-1 text-slate-600">
              e.g. <code>PROV1_PROV2_RG07_DETAIL_6809_01.xlsx</code>
            </p>
            <p className="mt-2 text-teal-700">→ eclaim_transaction_data</p>
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
                  <th className="px-3 py-3">Target</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Rows</th>
                  <th className="px-3 py-3">By</th>
                  <th className="px-3 py-3">When</th>
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                      No uploads yet.
                    </td>
                  </tr>
                ) : (
                  recent.map((b) => (
                    <tr key={b.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">{b.fileName}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {b.target ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            b.status === "SUCCESS"
                              ? "text-emerald-700"
                              : "text-red-700"
                          }
                          title={b.errorMessage ?? undefined}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">{b.rowCount}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {b.uploadedBy.name}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {b.createdAt.toLocaleString()}
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
