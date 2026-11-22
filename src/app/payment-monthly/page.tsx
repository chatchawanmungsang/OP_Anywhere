import { renderPublicReportPage } from "@/lib/report-page";

export const dynamic = "force-dynamic";

export default async function PaymentMonthlyPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  return renderPublicReportPage({
    kind: "payment",
    path: "/payment-monthly",
    title: "รายงานการจ่ายรายเดือน",
    subtitle:
      "แยกตามต้นสังกัด · รวมเดือน (Visit / ค่าบริการ) · จำนวนเงินชดเชย",
    codeLabel: "รหัส",
    nameLabel: "ชื่อหน่วยรักษา",
    searchParams,
  });
}
