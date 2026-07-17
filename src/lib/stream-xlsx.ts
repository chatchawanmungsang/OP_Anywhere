import { rmSync, existsSync } from "fs";
import {
  buildHeaderIndexMapFromRow,
  columnsForTarget,
  headersMatch,
  expectedExcelHeaders,
  normalizeHeader,
  rowValuesToRecord,
  type RowImportMeta,
  type UploadTargetType,
} from "./eclaim-schema";
import {
  iterateSheetRows,
  loadSharedStrings,
  parseRowCells,
  prepareWorkbook,
  rowHasData,
  rowMatchesFilter,
  type SheetEntry,
} from "./xlsx-stream-core";

export type StreamImportResult = {
  headers: string[];
  rowCount: number;
  rowsSkipped: number;
  sheetsProcessed: number;
  rowsPerSheet: Record<string, number>;
};

export type StreamImportOptions = {
  batchSize?: number;
  maxRows?: number;
  filterProv1: string;
  filterProv2: string;
  onBatch?: (rows: Record<string, unknown>[]) => Promise<void>;
  onProgress?: (progress: {
    rowCount: number;
    rowsSkipped: number;
    sheetIndex: number;
  }) => Promise<void>;
};

function findColumnIndex(
  headerIndexMap: Map<number, ReturnType<typeof columnsForTarget>[0]>,
  excelHeader: string,
): number | null {
  const norm = normalizeHeader(excelHeader).toUpperCase();
  for (const [index, col] of headerIndexMap) {
    if (normalizeHeader(col.excelHeader).toUpperCase() === norm) {
      return index;
    }
  }
  return null;
}

async function importSingleSheet(
  sheet: SheetEntry,
  target: UploadTargetType,
  meta: RowImportMeta,
  sharedStrings: string[],
  options: StreamImportOptions,
  referenceHeaders: string[] | null,
): Promise<{
  headers: string[];
  rowCount: number;
  rowsSkipped: number;
}> {
  if (!existsSync(sheet.sheetPath)) {
    if (sheet.sheetIndex === 1) {
      throw new Error(`Sheet ${sheet.sheetIndex} not found in workbook.`);
    }
    return { headers: referenceHeaders ?? [], rowCount: 0, rowsSkipped: 0 };
  }

  const batchSize = options.batchSize ?? 500;
  const columns = columnsForTarget(target);
  let headers: string[] | null = referenceHeaders;
  let headerIndexMap: Map<number, (typeof columns)[0]> | null = null;
  let rowCount = 0;
  let rowsSkipped = 0;
  let currentBatch: Record<string, unknown>[] = [];
  let prov1Idx: number | null = null;
  let prov2Idx: number | null = null;

  async function flushBatch() {
    if (currentBatch.length === 0) return;
    if (options.onBatch) {
      await options.onBatch(currentBatch);
    }
    currentBatch = [];
  }

  for await (const rowXml of iterateSheetRows(sheet.sheetPath)) {
    const values = parseRowCells(rowXml, sharedStrings).map((v) =>
      v == null ? null : String(v).trim(),
    );

    if (!rowHasData(values)) continue;

    if (!headers) {
      const foundHeaders = values
        .filter((v): v is string => v != null && v !== "")
        .map((v) => normalizeHeader(v));
      const match = headersMatch(expectedExcelHeaders(target), foundHeaders);
      if (!match.ok) {
        const details = [
          match.missing.length ? `missing: ${match.missing.join(", ")}` : null,
          match.extra.length ? `extra: ${match.extra.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join("; ");
        throw new Error(
          `Sheet ${sheet.sheetIndex} headers do not match SQL schema (${details}).`,
        );
      }
      headers = foundHeaders;
      headerIndexMap = buildHeaderIndexMapFromRow(values, columns);
      prov1Idx = findColumnIndex(headerIndexMap, "PROV1");
      prov2Idx = findColumnIndex(headerIndexMap, "PROV2");
      continue;
    }

    if (!headerIndexMap) {
      throw new Error("Header map missing after parsing header row.");
    }

    if (
      !rowMatchesFilter(
        values,
        prov1Idx,
        prov2Idx,
        options.filterProv1,
        options.filterProv2,
      )
    ) {
      rowsSkipped++;
      continue;
    }

    const record = rowValuesToRecord(values, headerIndexMap, {
      ...meta,
      sourceSheetIndex: target === "DETAIL" ? sheet.sheetIndex : undefined,
    });
    currentBatch.push(record);
    rowCount++;

    if (currentBatch.length >= batchSize) {
      await flushBatch();
      if (options.onProgress) {
        await options.onProgress({ rowCount, rowsSkipped, sheetIndex: sheet.sheetIndex });
      }
    }

    if (options.maxRows != null && rowCount >= options.maxRows) break;
  }

  await flushBatch();

  if (!headers) {
    throw new Error(`Sheet ${sheet.sheetIndex} has no header row.`);
  }

  return { headers, rowCount, rowsSkipped };
}

export async function streamImportXlsx(
  xlsxPath: string,
  target: UploadTargetType,
  meta: RowImportMeta,
  options: StreamImportOptions,
): Promise<StreamImportResult> {
  const { workDir, sharedPath, sheets } = prepareWorkbook(xlsxPath, target);
  const sharedStrings = await loadSharedStrings(sharedPath);

  let totalRowCount = 0;
  let totalRowsSkipped = 0;
  let sheetsProcessed = 0;
  const rowsPerSheet: Record<string, number> = {};
  let headers: string[] = [];
  let referenceHeaders: string[] | null = null;

  try {
    for (const sheet of sheets) {
      const result = await importSingleSheet(
        sheet,
        target,
        meta,
        sharedStrings,
        options,
        referenceHeaders,
      );

      if (sheet.sheetIndex === 1) {
        headers = result.headers;
        referenceHeaders = result.headers;
      } else if (referenceHeaders) {
        const match = headersMatch(referenceHeaders, result.headers);
        if (!match.ok) {
          throw new Error(
            `Sheet ${sheet.sheetIndex} headers differ from sheet 1.`,
          );
        }
      }

      totalRowCount += result.rowCount;
      totalRowsSkipped += result.rowsSkipped;
      if (result.rowCount > 0 || sheet.sheetIndex === 1) {
        sheetsProcessed++;
      }
      rowsPerSheet[String(sheet.sheetIndex)] = result.rowCount;

      if (options.onProgress) {
        await options.onProgress({
          rowCount: totalRowCount,
          rowsSkipped: totalRowsSkipped,
          sheetIndex: sheet.sheetIndex,
        });
      }
    }

    return {
      headers,
      rowCount: totalRowCount,
      rowsSkipped: totalRowsSkipped,
      sheetsProcessed,
      rowsPerSheet,
    };
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

// Re-export for consumers that need shared filter helpers.
export { rowMatchesFilter, findHeaderColumnIndex } from "./xlsx-stream-core";
