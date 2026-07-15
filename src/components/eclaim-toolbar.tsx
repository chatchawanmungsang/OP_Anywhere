"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { clearEclaimDataAction } from "@/app/actions";
import { UploadTarget } from "@prisma/client";

type Props = {
  target: UploadTarget;
  canDelete: boolean;
  total: number;
  page: number;
  pageSize: number;
  search: string;
  pagePath: string;
  tableLabel: string;
};

export function EclaimToolbar({
  target,
  canDelete,
  total,
  page,
  pageSize,
  search,
  pagePath,
  tableLabel,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function updateQuery(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([k, v]) => {
      if (!v) params.delete(k);
      else params.set(k, v);
    });
    router.push(`${pagePath}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <form
        className="flex flex-1 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          updateQuery({ q: String(fd.get("q") ?? ""), page: "1" });
        }}
      >
        <input
          name="q"
          defaultValue={search}
          placeholder="Search HCODE, HN, TRAN_ID, source file…"
          className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-teal-600/30 focus:ring-2"
        />
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Search
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <span>
          {total} row{total === 1 ? "" : "s"} · page {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => updateQuery({ page: String(page - 1) })}
          className="rounded-md border border-slate-200 px-2 py-1 disabled:opacity-40"
        >
          Prev
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => updateQuery({ page: String(page + 1) })}
          className="rounded-md border border-slate-200 px-2 py-1 disabled:opacity-40"
        >
          Next
        </button>
        {canDelete ? (
          <button
            type="button"
            disabled={pending || total === 0}
            onClick={() => {
              if (
                !confirm(
                  `Delete all ${total} rows from ${tableLabel}? This cannot be undone.`,
                )
              ) {
                return;
              }
              startTransition(async () => {
                await clearEclaimDataAction(target);
                router.refresh();
              });
            }}
            className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-red-700 disabled:opacity-40"
          >
            {pending ? "Clearing…" : "Clear table"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
