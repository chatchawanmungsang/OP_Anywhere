"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { runUploadBatchNowAction } from "@/app/actions";

export function RunNowButton({
  batchId,
  label = "ประมวลผลทันที",
}: {
  batchId: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const res = await runUploadBatchNowAction(batchId);
      if (!res.ok) {
        setError(res.message);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-md bg-teal-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-teal-700 disabled:opacity-50"
      >
        {pending ? "กำลังสั่ง…" : label}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
