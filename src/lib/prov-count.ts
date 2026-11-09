import { mkdirSync, statSync, writeFileSync } from "fs";
import path from "path";
import type { UploadTargetType } from "./eclaim-schema";
import {
  ensurePruneSourceExtracted,
  iterateSheetRows,
  loadSharedStringsCached,
  preparePruneJob,
  sourceSheetPath,
} from "./xlsx-stream-core";
import {
  headerRowHasData,
  readProvValuesFromRow,
  tryBuildProvColumnFilter,
} from "./xlsx-prov-filter";

const HEADER_SCAN_MAX_ROWS = 100;

export type Prov1Summary = {
  counts: Map<string, number>;
  prov1Values: string[];
  totalRows: number;
};

export type Prov1SummaryProgress = {
  phase: string;
  rowsScanned: number;
};

export type Prov1SummaryReport = {
  summary: Prov1Summary;
  reportText: string;
  reportPath: string;
};

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb) && a === String(na) && b === String(nb)) {
      return na - nb;
    }
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

function formatProv1Label(value: string): string {
  return value === "" ? "(empty)" : value;
}

async function resolveProv1Column(
  sheetPath: string,
  sharedStrings: string[],
): Promise<string | null> {
  let scanned = 0;
  for await (const rowXml of iterateSheetRows(sheetPath)) {
    if (!headerRowHasData(rowXml)) continue;
    const filter = tryBuildProvColumnFilter(rowXml, sharedStrings, "", "");
    if (filter) return filter.prov1Col;
    scanned++;
    if (scanned >= HEADER_SCAN_MAX_ROWS) break;
  }
  return null;
}

async function scanSheetProv1Counts(
  sheetPath: string,
  sharedStrings: string[],
  prov1Col: string,
  counts: Map<string, number>,
  onProgress?: (rowsScanned: number) => void,
): Promise<number> {
  let headerDone = false;
  let headerScanRows = 0;
  let rows = 0;

  for await (const rowXml of iterateSheetRows(sheetPath)) {
    if (!headerDone) {
      if (!headerRowHasData(rowXml)) continue;
      const headerFilter = tryBuildProvColumnFilter(
        rowXml,
        sharedStrings,
        "",
        "",
      );
      if (headerFilter) {
        headerDone = true;
        continue;
      }
      headerScanRows++;
      if (headerScanRows < HEADER_SCAN_MAX_ROWS) continue;
      headerDone = true;
    }

    const { prov1 } = readProvValuesFromRow(
      rowXml,
      prov1Col,
      prov1Col,
      sharedStrings,
    );
    counts.set(prov1, (counts.get(prov1) ?? 0) + 1);
    rows++;
    if (rows % 50_000 === 0) {
      onProgress?.(rows);
    }
  }

  onProgress?.(rows);
  return rows;
}

export function buildProv1Summary(counts: Map<string, number>): Prov1Summary {
  return {
    counts,
    prov1Values: sortedUnique(counts.keys()),
    totalRows: [...counts.values()].reduce((sum, n) => sum + n, 0),
  };
}

export function formatProv1SummaryTable(summary: Prov1Summary): string {
  const lines: string[] = [];
  const { prov1Values, counts, totalRows } = summary;

  lines.push(`Total data rows: ${totalRows.toLocaleString()}`, "");

  if (totalRows === 0) {
    lines.push("(no data rows)");
    return lines.join("\n");
  }

  const labelHeader = "PROV1";
  const countHeader = "Count";
  const labelWidth = Math.max(
    labelHeader.length,
    ...prov1Values.map((v) => formatProv1Label(v).length),
    8,
  );
  const countWidth = Math.max(countHeader.length, 8);

  lines.push("Summary by PROV1:");
  lines.push(
    `${labelHeader.padEnd(labelWidth)} | ${countHeader.padStart(countWidth)}`,
  );
  lines.push(
    `${"-".repeat(labelWidth)}-+-${"-".repeat(countWidth)}`,
  );

  for (const prov1 of prov1Values) {
    lines.push(
      `${formatProv1Label(prov1).padEnd(labelWidth)} | ${(counts.get(prov1) ?? 0).toLocaleString().padStart(countWidth)}`,
    );
  }

  lines.push(
    `${"-".repeat(labelWidth)}-+-${"-".repeat(countWidth)}`,
  );
  lines.push(
    `${"Total".padEnd(labelWidth)} | ${totalRows.toLocaleString().padStart(countWidth)}`,
  );

  return lines.join("\n");
}

export function prov1SummaryReportPath(
  outputDir: string,
  sourceFileName: string,
): string {
  const base = path.basename(sourceFileName, path.extname(sourceFileName));
  return path.join(outputDir, `${base}.txt`);
}

export function formatProv1SummaryReport(
  sourceFileName: string,
  summary: Prov1Summary,
  generatedAt: Date,
): string {
  const header = [
    "PROV1 row count (before prune)",
    `Source: ${sourceFileName}`,
    `Generated: ${generatedAt.toLocaleString("th-TH", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })}`,
    "",
  ];

  return `${header.join("\n")}${formatProv1SummaryTable(summary)}\n`;
}

/** Count rows grouped by PROV1 (SUM files — sheet 1 only). */
export async function countProv1SummaryForFile(
  xlsxPath: string,
  target: UploadTargetType,
  outputDir: string,
  options?: {
    workDir?: string;
    onProgress?: (progress: Prov1SummaryProgress) => void;
  },
): Promise<Prov1SummaryReport> {
  if (target !== "SUMMARY") {
    throw new Error("PROV1 summary is only supported for SUM files.");
  }

  const fileName = path.basename(xlsxPath);
  const { size: fileSize, mtimeMs } = statSync(xlsxPath);
  const prepared = await preparePruneJob(xlsxPath, target, options?.workDir);
  const { workDir, sheets } = prepared;
  const sheet = sheets[0];
  if (!sheet) {
    throw new Error("Workbook has no sheets.");
  }

  options?.onProgress?.({ phase: "แตกไฟล์", rowsScanned: 0 });

  ensurePruneSourceExtracted(
    xlsxPath,
    workDir,
    sheets,
    fileSize,
    mtimeMs,
  );

  const sharedStrings = await loadSharedStringsCached(workDir);
  const sheetPath = sourceSheetPath(workDir, sheet);
  const prov1Col = await resolveProv1Column(sheetPath, sharedStrings);
  if (!prov1Col) {
    throw new Error("Sheet is missing PROV1 column.");
  }

  options?.onProgress?.({ phase: "นับ PROV1", rowsScanned: 0 });

  const counts = new Map<string, number>();
  await scanSheetProv1Counts(
    sheetPath,
    sharedStrings,
    prov1Col,
    counts,
    (rowsScanned) => {
      options?.onProgress?.({ phase: "นับ PROV1", rowsScanned });
    },
  );

  const summary = buildProv1Summary(counts);
  const generatedAt = new Date();
  const reportText = formatProv1SummaryReport(fileName, summary, generatedAt);
  const reportPath = prov1SummaryReportPath(outputDir, fileName);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(reportPath, reportText, "utf8");

  return { summary, reportText, reportPath };
}
