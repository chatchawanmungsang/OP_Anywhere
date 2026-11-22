import { PageShell } from "@/components/page-shell";
import { HomeDashboard } from "@/components/home-dashboard";
import {
  getDashboardPayload,
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

  let selectedYear = Number(params.year) || months[0]?.yearThai || 2569;
  let selectedMonth = Number(params.month) || months[0]?.monthThai || 1;

  if (
    months.length > 0 &&
    !months.some(
      (m) => m.yearThai === selectedYear && m.monthThai === selectedMonth,
    )
  ) {
    selectedYear = months[0].yearThai;
    selectedMonth = months[0].monthThai;
  }

  const data = await getDashboardPayload(selectedYear, selectedMonth);

  return (
    <PageShell activePath="/">
      <HomeDashboard data={data} />
    </PageShell>
  );
}
