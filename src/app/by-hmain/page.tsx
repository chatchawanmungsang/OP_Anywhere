import { renderPublicReportPage } from "@/lib/report-page";

export const dynamic = "force-dynamic";

export default async function ByHmainPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  return renderPublicReportPage({
    kind: "hmain",
    path: "/by-hmain",
    title: "สรุปจำนวนรายการตามหน่วยบริการประจำ",
    subtitle:
      "แยกตามต้นสังกัด · รหัส / หน่วยบริการประจำ (HMAIN2) · งวด 1 / งวด 2 / รวมเดือน",
    codeLabel: "รหัส",
    nameLabel: "หน่วยบริการประจำ",
    searchParams,
  });
}
