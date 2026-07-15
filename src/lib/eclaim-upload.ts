export type UploadTargetType = "SUMMARY" | "DETAIL";

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export function detectUploadTarget(fileName: string): UploadTargetType | null {
  const upper = fileName.toUpperCase();
  const hasSum = upper.includes("SUM");
  const hasDetail = upper.includes("DETAIL");
  if (hasSum && !hasDetail) return "SUMMARY";
  if (hasDetail && !hasSum) return "DETAIL";
  return null;
}

export function isXlsxFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type;
  return (
    name.endsWith(".xlsx") ||
    type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    type === "application/octet-stream"
  );
}
