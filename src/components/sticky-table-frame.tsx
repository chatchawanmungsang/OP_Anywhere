import type { ReactNode } from "react";

type Props = {
  children?: ReactNode;
  className?: string;
  empty?: boolean;
  emptyMessage?: string;
};

/** Scrollable frame that fills remaining viewport height for sticky table headers. */
export function StickyTableFrame({
  children,
  className = "",
  empty = false,
  emptyMessage = "ไม่มีข้อมูล",
}: Props) {
  if (empty) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      className={`min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export const stickyTheadClass =
  "sticky top-0 z-20 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgba(15,23,42,0.08)]";

export const stickyThClass = "whitespace-nowrap bg-slate-50 px-3 py-3 font-semibold";
