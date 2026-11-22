import type { ReactNode } from "react";
import { AppNav } from "@/components/app-nav";

type Props = {
  activePath: string;
  /** Optional top header (title / toolbar) — stays fixed above the scroll area */
  header?: ReactNode;
  children: ReactNode;
};

/** Full-width viewport shell: height capped to screen, scroll lives in children. */
export function PageShell({ activePath, header, children }: Props) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top,_#ecfdf5_0%,_#f8fafc_45%,_#e2e8f0_100%)]">
      <AppNav activePath={activePath} />
      <main className="flex min-h-0 flex-1 flex-col gap-3 px-3 py-3 sm:px-4">
        {header ? <div className="shrink-0 space-y-3">{header}</div> : null}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </main>
    </div>
  );
}
