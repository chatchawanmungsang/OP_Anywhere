export type ParsedFilePeriod = {
  dataYearThai: number;
  dataMonthThai: number;
  dataPeriod: number;
};

export const THAI_MONTHS = [
  { value: 1, label: "มกราคม" },
  { value: 2, label: "กุมภาพันธ์" },
  { value: 3, label: "มีนาคม" },
  { value: 4, label: "เมษายน" },
  { value: 5, label: "พฤษภาคม" },
  { value: 6, label: "มิถุนายน" },
  { value: 7, label: "กรกฎาคม" },
  { value: 8, label: "สิงหาคม" },
  { value: 9, label: "กันยายน" },
  { value: 10, label: "ตุลาคม" },
  { value: 11, label: "พฤศจิกายน" },
  { value: 12, label: "ธันวาคม" },
] as const;

/** e.g. PROV1_PROV2_RG07_SUM_6809_01.xlsx → year 2568, month 9, period 1 */
export function parsePeriodFromFileName(
  fileName: string,
): ParsedFilePeriod | null {
  const match = fileName.match(/_(\d{2})(\d{2})_(\d{2})(?:[_-]?prune)?\.xlsx$/i);
  if (!match) return null;
  const yearSuffix = Number(match[1]);
  const month = Number(match[2]);
  const period = Number(match[3]);
  if (month < 1 || month > 12 || (period !== 1 && period !== 2)) return null;
  return {
    dataYearThai: 2500 + yearSuffix,
    dataMonthThai: month,
    dataPeriod: period,
  };
}

export function validateUploadMetadata(input: {
  dataYearThai: number;
  dataMonthThai: number;
  dataPeriod: number;
  filterProv1: string;
  filterProv2: string;
}): string | null {
  if (input.dataYearThai < 2500 || input.dataYearThai > 2600) {
    return "ปี พ.ศ. ต้องอยู่ระหว่าง 2500–2600";
  }
  if (input.dataMonthThai < 1 || input.dataMonthThai > 12) {
    return "เดือนต้องอยู่ระหว่าง 1–12";
  }
  if (input.dataPeriod !== 1 && input.dataPeriod !== 2) {
    return "งวดต้องเป็น 1 หรือ 2";
  }
  if (!input.filterProv1.trim()) return "PROV1 is required.";
  if (!input.filterProv2.trim()) return "PROV2 is required.";
  return null;
}

export function formatThaiPeriod(
  year: number,
  month: number,
  period: number,
): string {
  const monthLabel =
    THAI_MONTHS.find((m) => m.value === month)?.label ?? String(month);
  return `${monthLabel} ${year} งวด ${period}`;
}

/** Next midnight in Asia/Bangkok */
export function computeNextScheduleAt(now = new Date()): Date {
  const hour = Number(process.env.IMPORT_SCHEDULE_HOUR ?? "0");
  const minute = Number(process.env.IMPORT_SCHEDULE_MINUTE ?? "0");
  const bangkokNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }),
  );
  const scheduled = new Date(bangkokNow);
  scheduled.setHours(hour, minute, 0, 0);
  if (scheduled <= bangkokNow) {
    scheduled.setDate(scheduled.getDate() + 1);
  }
  const offsetMs =
    now.getTime() -
    new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" })).getTime();
  return new Date(scheduled.getTime() + offsetMs);
}

export function archiveRelativePath(
  year: number,
  month: number,
  period: number,
  batchId: string,
  fileName: string,
): string {
  const monthPadded = String(month).padStart(2, "0");
  return `${year}/${monthPadded}/period-${period}/${batchId}_${fileName}`;
}
