import Link from "next/link";
import { THAI_MONTHS, formatThaiPeriod } from "@/lib/import-metadata";

export type ReceiptItemRow = {
  id: string;
  itemCode: string | null;
  tmtId: string | null;
  itemName: string | null;
  codeName: string | null;
  detailText: string | null;
  sevGroup: string | null;
  drugUnit: string | null;
  dosageform: string | null;
  reqQty: number | null;
  paidQty: number | null;
  unitPrice: number | null;
  amountClaim: number | null;
  amountPaid: number | null;
};

export type ReceiptHeaderInfo = {
  tranId: string;
  hcode: string | null;
  hname: string | null;
  hsubAf: string | null;
  hsubAfName: string | null;
  dateadm: string | null;
  timeadm: string | null;
  dx: string | null;
  pdx: string | null;
  pdxName: string | null;
  periodLabel: string | null;
  stmtPeriod: string | null;
  detailSourceFileName: string | null;
  summarySourceFileName: string | null;
  rep: string | null;
  hn: string | null;
  chargeCost: number | null;
  sumsCost: number | null;
};

type Props = {
  header: ReceiptHeaderInfo;
  items: ReceiptItemRow[];
};

function formatThaiDateAdm(
  dateadm: string | null,
  timeadm: string | null,
): string {
  if (!dateadm) return "—";
  const raw = dateadm.trim();
  let datePart = raw;

  if (/^\d{8}$/.test(raw)) {
    const yearNum = Number(raw.slice(0, 4));
    const monthNum = Number(raw.slice(4, 6));
    const dayNum = Number(raw.slice(6, 8));
    const yearThai = yearNum < 2400 ? yearNum + 543 : yearNum;
    const monthLabel =
      THAI_MONTHS.find((m) => m.value === monthNum)?.label ??
      String(monthNum).padStart(2, "0");
    datePart = `${dayNum} ${monthLabel} ${yearThai}`;
  }

  if (timeadm && timeadm.trim() !== "") {
    const t = timeadm.trim();
    const formattedTime =
      /^\d{4}$/.test(t) ? `${t.slice(0, 2)}:${t.slice(2, 4)} น.` : t;
    return `${datePart} เวลา ${formattedTime}`;
  }

  return datePart;
}

function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "0.00";
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function DetailReceipt({ header, items }: Props) {
  const totalClaim = items.reduce(
    (sum, item) => sum + (item.amountClaim ?? 0),
    0,
  );
  const totalPaid = items.reduce(
    (sum, item) => sum + (item.amountPaid ?? 0),
    0,
  );

  const sourceFiles = [
    header.detailSourceFileName,
    header.summarySourceFileName &&
    header.summarySourceFileName !== header.detailSourceFileName
      ? header.summarySourceFileName
      : null,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href="/summary"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-xs transition hover:bg-slate-50"
          >
            ← กลับหน้า Summary
          </Link>
          <Link
            href="/detail"
            className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50/70 px-3.5 py-2 text-sm font-medium text-teal-800 transition hover:bg-teal-100/70"
          >
            ดูตาราง Detail ทั้งหมด
          </Link>
        </div>
        <span className="rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-900">
          ใบเสร็จรายการรักษา (TRAN_ID: {header.tranId})
        </span>
      </div>

      {/* Receipt Container */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md">
        {/* Top Receipt Banner */}
        <div className="border-b border-dashed border-slate-300 bg-gradient-to-r from-teal-900 via-teal-800 to-emerald-900 px-6 py-5 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-teal-200">
                OP Anywhere · E-Claim Treatment Receipt
              </p>
              <h2 className="mt-1 text-xl font-bold tracking-tight">
                รายการรักษาพยาบาลรายธุรกรรม
              </h2>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-2 text-right backdrop-blur-xs">
              <p className="text-[11px] uppercase tracking-wider text-teal-200">
                รหัสธุรกรรม (TRAN_ID)
              </p>
              <p className="font-mono text-lg font-bold tracking-wide text-white">
                {header.tranId}
              </p>
            </div>
          </div>
        </div>

        {/* Receipt Header Details (ก่อนหัวตาราง) */}
        <div className="border-b border-dashed border-slate-300 bg-slate-50/70 px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
              <p className="text-xs font-medium text-slate-500">
                รหัส TRAN_ID
              </p>
              <p className="mt-1 font-mono text-base font-semibold text-slate-900">
                {header.tranId}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs sm:col-span-1 lg:col-span-2">
              <p className="text-xs font-medium text-slate-500">
                รหัสและชื่อหน่วยที่รักษา (HCODE / HNAME)
              </p>
              <p className="mt-1 text-base font-semibold text-slate-900">
                {header.hcode ? (
                  <span className="mr-2 inline-block rounded bg-teal-100 px-2 py-0.5 font-mono text-sm font-bold text-teal-900">
                    {header.hcode}
                  </span>
                ) : null}
                <span>{header.hname ?? "—"}</span>
              </p>
              {header.hsubAf || header.hsubAfName ? (
                <p className="mt-1 text-xs text-slate-500">
                  หน่วยบริการประจำ (HSUB_AF):{" "}
                  <span className="font-medium text-slate-700">
                    {[header.hsubAf, header.hsubAfName]
                      .filter(Boolean)
                      .join(" - ")}
                  </span>
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
              <p className="text-xs font-medium text-slate-500">
                วันเดือนปีที่รับบริการ (DATEADM)
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {formatThaiDateAdm(header.dateadm, header.timeadm)}
              </p>
              {header.dateadm ? (
                <p className="mt-0.5 font-mono text-xs text-slate-400">
                  รหัสวันที่: {header.dateadm}
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
              <p className="text-xs font-medium text-slate-500">
                การวินิจฉัย (DX)
              </p>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-900 break-words">
                {header.dx && header.dx.trim() !== "" ? header.dx : "—"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
              <p className="text-xs font-medium text-slate-500">
                การวินิจฉัยโรคหลัก (PDX / PDX_NAME)
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900 break-words">
                {header.pdx ? (
                  <span className="mr-1.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs font-bold text-amber-900">
                    {header.pdx}
                  </span>
                ) : null}
                <span>
                  {header.pdxName && header.pdxName.trim() !== ""
                    ? header.pdxName
                    : !header.pdx
                      ? "—"
                      : ""}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Receipt Items Table (ตารางรายการรักษาเฉพาะคอลัมน์ที่ไม่ซ้ำกัน) */}
        <div className="overflow-x-auto px-6 py-5">
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-slate-500">
              ไม่พบรายการรักษาในตาราง Detail สำหรับ TRAN_ID {header.tranId}{" "}
              (อาจยังไม่ได้นำเข้าไฟล์ DETAIL ของงวดนี้)
            </div>
          ) : (
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-100/80 text-xs font-semibold uppercase tracking-wider text-slate-600">
                  <th className="w-12 px-3 py-3 text-center">#</th>
                  <th className="whitespace-nowrap px-3 py-3">ITEM_CODE</th>
                  <th className="whitespace-nowrap px-3 py-3">TMT_ID</th>
                  <th className="px-3 py-3">ITEM_NAME (รายการรักษา)</th>
                  <th className="whitespace-nowrap px-3 py-3 text-right">
                    จำนวน
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 text-right">
                    ราคากลาง
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 text-right">
                    ยอดเบิก
                  </th>
                  <th className="whitespace-nowrap px-3 py-3 text-right">
                    ยอดจ่าย
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {items.map((item, idx) => {
                  const displayName =
                    item.itemName ||
                    item.codeName ||
                    item.detailText ||
                    "—";
                  const qtyText =
                    item.paidQty != null && item.reqQty != null
                      ? item.paidQty === item.reqQty
                        ? `${item.reqQty}`
                        : `${item.reqQty} (จ่าย ${item.paidQty})`
                      : item.reqQty != null
                        ? `${item.reqQty}`
                        : item.paidQty != null
                          ? `${item.paidQty}`
                          : "—";

                  return (
                    <tr
                      key={item.id}
                      className="transition-colors hover:bg-teal-50/40"
                    >
                      <td className="px-3 py-3 text-center font-mono text-xs text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-xs font-semibold text-slate-800">
                        {item.itemCode || "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-600">
                        {item.tmtId || "—"}
                      </td>
                      <td className="px-3 py-3 text-slate-900">
                        <div className="font-medium">{displayName}</div>
                        {item.drugUnit || item.dosageform || item.sevGroup ? (
                          <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-slate-500">
                            {item.drugUnit ? (
                              <span>หน่วย: {item.drugUnit}</span>
                            ) : null}
                            {item.dosageform ? (
                              <span>รูปแบบ: {item.dosageform}</span>
                            ) : null}
                            {item.sevGroup ? (
                              <span>หมวด: {item.sevGroup}</span>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs text-slate-700">
                        {qtyText}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-slate-700">
                        {formatMoney(item.unitPrice)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-medium text-slate-900">
                        {formatMoney(item.amountClaim)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-semibold text-teal-800">
                        {formatMoney(item.amountPaid)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900">
                  <td colSpan={5} className="px-3 py-3.5 text-right text-sm">
                    รวมทั้งสิ้น ({items.length} รายการ)
                  </td>
                  <td className="px-3 py-3.5 text-right font-mono text-xs text-slate-400">
                    —
                  </td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-right font-mono text-base text-slate-900">
                    {formatMoney(totalClaim)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-right font-mono text-base text-teal-800">
                    {formatMoney(totalPaid)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Receipt Footer (ด้านท้ายของตาราง: งวดเดือน, ชื่อไฟล์นำเข้า, REP, HN) */}
        <div className="border-t border-dashed border-slate-300 bg-slate-50 px-6 py-4">
          <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-medium text-slate-500">งวดเดือน</p>
              <p className="mt-0.5 font-semibold text-slate-900">
                {header.periodLabel ?? "—"}
              </p>
              {header.stmtPeriod ? (
                <p className="font-mono text-xs text-slate-500">
                  STMT_PERIOD: {header.stmtPeriod}
                </p>
              ) : null}
            </div>

            <div>
              <p className="text-xs font-medium text-slate-500">
                ชื่อไฟล์นำเข้า
              </p>
              {sourceFiles.length > 0 ? (
                <div className="mt-0.5 space-y-0.5">
                  {sourceFiles.map((f) => (
                    <p
                      key={f}
                      className="truncate font-mono text-xs font-semibold text-slate-800"
                      title={f}
                    >
                      {f}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-0.5 font-semibold text-slate-900">—</p>
              )}
            </div>

            <div>
              <p className="text-xs font-medium text-slate-500">REP</p>
              <p className="mt-0.5 font-mono font-semibold text-slate-900">
                {header.rep && header.rep.trim() !== "" ? header.rep : "—"}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-500">HN</p>
              <p className="mt-0.5 font-mono font-semibold text-slate-900">
                {header.hn && header.hn.trim() !== "" ? header.hn : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { formatThaiPeriod };
