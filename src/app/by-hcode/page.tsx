import { renderPublicReportPage } from "@/lib/report-page";

export const dynamic = "force-dynamic";

export default async function ByHcodePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  return renderPublicReportPage({
    kind: "hcode",
    path: "/by-hcode",
    title: "สรุปจำนวนรายการตามหน่วยที่รักษา",
    subtitle:
      "แยกตามต้นสังกัด · รหัส / ชื่อหน่วยรักษา · งวด 1 / งวด 2 / รวมเดือน",
    codeLabel: "รหัส",
    nameLabel: "ชื่อหน่วยรักษา",
    searchParams,
  });
}
