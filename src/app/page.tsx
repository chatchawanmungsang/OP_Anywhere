import { PageShell } from "@/components/page-shell";
import { PublicMonthSummary } from "@/components/public-month-summary";
import {
  getHcodeCrosstabForMonth,
  listAvailableSummaryMonths,
} from "@/lib/public-summary-stats";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
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
      ? await getHcodeCrosstabForMonth(selectedYear, selectedMonth)
      : {
          groups: [],
          totals: {
            p1TranCount: 0,
            p1ChargeCost: 0,
            p2TranCount: 0,
            p2ChargeCost: 0,
            monthTranCount: 0,
            monthChargeCost: 0,
            unitCount: 0,
          },
        };

  return (
    <PageShell activePath="/" showNav={false}>
      <PublicMonthSummary
        months={months}
        selectedYear={selectedYear}
        selectedMonth={selectedMonth}
        crosstab={crosstab}
      />
    </PageShell>
  );
}
