import type { ReactNode } from "react";
import { AppNav } from "@/components/app-nav";

type Props = {
  activePath: string;
  /** Optional top header (title / toolbar) — stays fixed above the scroll area */
  header?: ReactNode;
  children: ReactNode;
  /** When false, skip AppNav (e.g. public home with custom header) */
  showNav?: boolean;
};

/** Full-width viewport shell: height capped to screen, scroll lives in children. */
export function PageShell({
  activePath,
  header,
  children,
  showNav = true,
}: Props) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top,_#ecfdf5_0%,_#f8fafc_45%,_#e2e8f0_100%)]">
      {showNav ? <AppNav activePath={activePath} /> : null}
      <main className="flex min-h-0 flex-1 flex-col gap-3 px-3 py-3 sm:px-4">
        {header ? <div className="shrink-0 space-y-3">{header}</div> : null}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </main>
    </div>
  );
}
