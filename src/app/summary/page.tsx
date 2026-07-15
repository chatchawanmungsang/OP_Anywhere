import { UploadTarget } from "@prisma/client";
import { EclaimPage } from "@/components/eclaim-page";

export default function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  return (
    <EclaimPage
      target={UploadTarget.SUMMARY}
      targetType="SUMMARY"
      title="Summary"
      tableLabel="eclaim_transaction_summary"
      path="/summary"
      searchParams={searchParams}
    />
  );
}
