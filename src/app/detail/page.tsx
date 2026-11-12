import { UploadTarget } from "@prisma/client";
import { EclaimPage } from "@/components/eclaim-page";

export default function DetailPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; tranId?: string }>;
}) {
  return (
    <EclaimPage
      target={UploadTarget.DETAIL}
      targetType="DETAIL"
      title="Detail"
      tableLabel="eclaim_transaction_data"
      path="/detail"
      searchParams={searchParams}
    />
  );
}
