"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteImportBatchDataAction } from "@/app/actions";

type Props = {
  batchId: string;
  label: string;
};

export function DeleteBatchButton({ batchId, label }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            `ลบข้อมูลทั้งหมดของ ${label}?\nการกระทำนี้ไม่สามารถย้อนกลับได้ และต้องนำเข้าใหม่หากต้องการใช้ข้อมูลอีกครั้ง`,
          )
        ) {
          return;
        }
        startTransition(async () => {
          const result = await deleteImportBatchDataAction(batchId);
          if (!result.ok) {
            alert(result.message);
            return;
          }
          alert(result.message);
          router.refresh();
        });
      }}
      className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
    >
      {pending ? "กำลังลบ…" : "ลบข้อมูลงวดนี้"}
    </button>
  );
}
