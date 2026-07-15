"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { detectUploadTarget } from "@/lib/eclaim-upload";

type UploadResult = {
  ok: boolean;
  message: string;
};

export function UploadForm() {
  const router = useRouter();
  const [result, setResult] = useState<UploadResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const detected = fileName ? detectUploadTarget(fileName) : null;
  const targetLabel =
    detected === "SUMMARY"
      ? "eclaim_transaction_summary"
      : detected === "DETAIL"
        ? "eclaim_transaction_data"
        : null;

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

    const formData = new FormData();
    formData.append("file", file);

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
          Filename must contain SUM or DETAIL. Imports Sheet 1 only. Max 500MB.
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
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
        />
      </label>

      <button
        type="submit"
        disabled={pending || (fileName !== "" && !targetLabel)}
        className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
      >
        {pending ? "Importing…" : "Import Excel"}
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
