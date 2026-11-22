import { UploadTarget } from "@prisma/client";
import { redirect } from "next/navigation";
import { EclaimPage } from "@/components/eclaim-page";

export default async function DetailPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; tranId?: string }>;
}) {
  const params = await searchParams;
  const tranId = (params.tranId ?? "").trim();
  // ไม่แสดงตาราง Detail ในเมนูหลัก — เปิดได้เฉพาะมุมมองใบเสร็จผ่าน TRAN_ID
  if (!/^\d+$/.test(tranId)) {
    redirect("/summary");
  }

  return (
    <EclaimPage
      target={UploadTarget.DETAIL}
      targetType="DETAIL"
      title="Detail"
      tableLabel="eclaim_transaction_data"
      path="/detail"
      searchParams={Promise.resolve(params)}
    />
  );
}
