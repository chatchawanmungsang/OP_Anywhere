"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { detectUploadTarget } from "@/lib/eclaim-upload";
import {
  parsePeriodFromFileName,
  THAI_MONTHS,
} from "@/lib/import-metadata";

type UploadResult = {
  ok: boolean;
  message: string;
  batchId?: string;
  scheduledAt?: string;
};

export function UploadForm() {
  const router = useRouter();
  const [result, setResult] = useState<UploadResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [dataYearThai, setDataYearThai] = useState<string>("2568");
  const [dataMonthThai, setDataMonthThai] = useState<string>("9");
  const [dataPeriod, setDataPeriod] = useState<string>("1");
  const [filterProv1, setFilterProv1] = useState<string>("");
  const [filterProv2, setFilterProv2] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const detected = fileName ? detectUploadTarget(fileName) : null;
  const targetLabel =
    detected === "SUMMARY"
      ? "eclaim_transaction_summary"
      : detected === "DETAIL"
        ? "eclaim_transaction_data"
        : null;

  function onFileChange(name: string) {
    setFileName(name);
    const parsed = parsePeriodFromFileName(name);
    if (parsed) {
      setDataYearThai(String(parsed.dataYearThai));
      setDataMonthThai(String(parsed.dataMonthThai));
      setDataPeriod(String(parsed.dataPeriod));
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      setResult({ ok: false, message: "Please select a file." });
      return;
    }

    if (!filterProv1.trim() || !filterProv2.trim()) {
      setResult({ ok: false, message: "PROV1 และ PROV2 จำเป็นต้องระบุ" });
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("dataYearThai", dataYearThai);
    formData.append("dataMonthThai", dataMonthThai);
    formData.append("dataPeriod", dataPeriod);
    formData.append("filterProv1", filterProv1.trim());
    formData.append("filterProv2", filterProv2.trim());

    startTransition(async () => {
      try {
        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const data = (await response.json()) as UploadResult;
        setResult(data);
        if (data.ok) {
          router.refresh();
        }
      } catch {
        setResult({
          ok: false,
          message: "Upload failed. Check your connection and try again.",
        });
      }
    });
  }

  const canSubmit =
    fileName !== "" &&
    targetLabel &&
    filterProv1.trim() !== "" &&
    filterProv2.trim() !== "";

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <label
        htmlFor="file"
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center transition hover:border-teal-500 hover:bg-teal-50/40"
      >
        <span className="text-base font-medium text-slate-800">
          {fileName || "Drop or choose a SUM / DETAIL .xlsx file"}
        </span>
        <span className="mt-2 text-sm text-slate-500">
          Filename must contain SUM or DETAIL. Max 500MB. Import runs overnight.
        </span>
        {targetLabel ? (
          <span className="mt-3 rounded-full bg-teal-100 px-3 py-1 text-xs font-medium text-teal-800">
            Target table: {targetLabel}
          </span>
        ) : fileName ? (
          <span className="mt-3 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
            Filename must include SUM or DETAIL (not both)
          </span>
        ) : null}
        <input
          id="file"
          name="file"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          className="sr-only"
          onChange={(e) => onFileChange(e.target.files?.[0]?.name ?? "")}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">ปี พ.ศ.</span>
          <input
            type="number"
            min={2500}
            max={2600}
            required
            value={dataYearThai}
            onChange={(e) => setDataYearThai(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">เดือน</span>
          <select
            required
            value={dataMonthThai}
            onChange={(e) => setDataMonthThai(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            {THAI_MONTHS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="text-sm">
          <legend className="font-medium text-slate-700">งวด</legend>
          <div className="mt-2 flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="dataPeriod"
                value="1"
                checked={dataPeriod === "1"}
                onChange={() => setDataPeriod("1")}
              />
              งวด 1
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="dataPeriod"
                value="2"
                checked={dataPeriod === "2"}
                onChange={() => setDataPeriod("2")}
              />
              งวด 2
            </label>
          </div>
        </fieldset>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">PROV1 *</span>
          <input
            type="text"
            required
            placeholder="เช่น 4000"
            value={filterProv1}
            onChange={(e) => setFilterProv1(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">PROV2 *</span>
          <input
            type="text"
            required
            placeholder="เช่น 4000"
            value={filterProv2}
            onChange={(e) => setFilterProv2(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      <p className="text-xs text-slate-500">
        นำเข้าเฉพาะแถวที่ PROV1 และ PROV2 ตรงกับที่ระบุ — ประมวลผลช่วงดึก
      </p>

      <button
        type="submit"
        disabled={pending || !canSubmit}
        className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
      >
        {pending ? "กำลังอัปโหลด…" : "อัปโหลด (ประมวลผลช่วงดึก)"}
      </button>

      {result ? (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            result.ok
              ? "bg-emerald-50 text-emerald-800"
              : "bg-red-50 text-red-700"
          }`}
        >
          {result.message}
        </p>
      ) : null}
    </form>
  );
}
