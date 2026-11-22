import { PageShell } from "@/components/page-shell";
import { PublicReportView } from "@/components/public-report-view";
import {
  getReportCrosstab,
  listAvailableSummaryMonths,
  type ReportKind,
} from "@/lib/public-summary-stats";

export async function renderPublicReportPage(input: {
  kind: ReportKind;
  path: string;
  title: string;
  subtitle: string;
  codeLabel: string;
  nameLabel: string;
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await input.searchParams;
  const months = await listAvailableSummaryMonths();

  let selectedYear = Number(params.year) || months[0]?.yearThai || null;
  let selectedMonth = Number(params.month) || months[0]?.monthThai || null;

  if (
    selectedYear &&
    selectedMonth &&
    !months.some(
      (m) => m.yearThai === selectedYear && m.monthThai === selectedMonth,
    )
  ) {
    selectedYear = months[0]?.yearThai ?? null;
    selectedMonth = months[0]?.monthThai ?? null;
  }

  const crosstab =
    selectedYear && selectedMonth
      ? await getReportCrosstab(input.kind, selectedYear, selectedMonth)
      : {
          groups: [],
          totals: {
            p1TranCount: 0,
            p1ChargeCost: 0,
            p2TranCount: 0,
            p2ChargeCost: 0,
            monthTranCount: 0,
            monthChargeCost: 0,
            compensation: 0,
            unitCount: 0,
          },
        };

  return (
    <PageShell activePath={input.path}>
      <PublicReportView
        kind={input.kind}
        title={input.title}
        subtitle={input.subtitle}
        codeLabel={input.codeLabel}
        nameLabel={input.nameLabel}
        months={months}
        selectedYear={selectedYear}
        selectedMonth={selectedMonth}
        crosstab={crosstab}
        path={input.path}
      />
    </PageShell>
  );
}
