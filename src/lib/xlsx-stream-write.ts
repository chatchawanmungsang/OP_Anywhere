import { createWriteStream, existsSync, statSync } from "fs";
import { finished } from "stream/promises";
import {
  isRowBoundaryOffset,
  iterateSheetRowsFromReadable,
  openTrackedSheetStream,
  readSheetPrefixFromFile,
} from "./xlsx-stream-core";
import {
  buildProvColumnFilter,
  headerRowHasData,
  provFilterFromColumns,
  rowMatchesProvFast,
  tryBuildProvColumnFilter,
  type ProvColumnFilter,
} from "./xlsx-prov-filter";

const DEFAULT_SHEET_SUFFIX = "</sheetData></worksheet>";
const WRITE_BUFFER_BYTES = 2 * 1024 * 1024;
const CHECKPOINT_EVERY_DEFAULT = 100_000;
const PROGRESS_EVERY = 5_000;
const HEADER_SCAN_MAX_ROWS = 100;

export type FilterSheetProgress = {
  rowsKept: number;
  rowsSkipped: number;
  rowsScanned: number;
  estimatedMaxRow: number | null;
  prov1Col?: string;
  prov2Col?: string;
  subFundCol?: string;
  sumsCostCol?: string;
  tranIdCol?: string;
  skippingRows?: boolean;
  lastRowNum?: number;
  sourceOffset?: number;
  phase?: string;
};

export type FilterSheetResume = {
  rowsKept: number;
  rowsSkipped: number;
  appendPartial: boolean;
  prov1Col?: string;
  prov2Col?: string;
  subFundCol?: string;
  sumsCostCol?: string;
  tranIdCol?: string;
  /** @deprecated Legacy — ignored when lastRowNum is set. */
  rowsScanned?: number;
  lastRowNum?: number;
  sourceOffset?: number;
};

export type StreamFilterSheetOptions = {
  filterProv1: string;
  filterProv2: string;
  filterSubFundContains: string;
  filterSumsCostEquals: number;
  allowedTranIds?: ReadonlySet<string>;
  sharedStrings: string[];
  resume?: FilterSheetResume;
  /** Reuse PROV/TRAN_ID columns from an earlier sheet (DETAIL sheet 2). */
  fallbackProvFilter?: ProvColumnFilter;
  /** Header row XML copied from sheet 1 when sheet 2 has no header row. */
  fallbackHeaderRowXml?: string;
  checkpointEvery?: number;
  onCheckpoint?: (progress: FilterSheetProgress) => void | Promise<void>;
  shouldStop?: () => boolean;
  onProgress?: (progress: FilterSheetProgress) => void;
};

export type StreamFilterSheetResult = {
  rowsKept: number;
  rowsSkipped: number;
  rowsScanned: number;
  estimatedMaxRow: number | null;
  prov1Col: string;
  prov2Col: string;
  subFundCol?: string;
  sumsCostCol?: string;
  tranIdCol?: string;
  paused: boolean;
  lastRowNum: number;
  sourceOffset: number;
};

export function parseDimensionMaxRow(prefix: string): number | null {
  const match = prefix.match(/<dimension[^>]*ref="[^:"]*:?[A-Z]*(\d+)"/i);
  if (!match) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseRowNumber(rowXml: string): number | null {
  const match = rowXml.match(/\br="[A-Z]+(\d+)"/i);
  if (!match) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) ? n : null;
}

/** Drop sparse dimension tag; Excel recalculates on open. */
export function compactSheetPrefix(prefix: string): string {
  return prefix.replace(/<dimension\b[^>]*\/>/gi, "");
}

/** Rewrite row/cell `r` attributes so output rows are contiguous (1, 2, 3…). */
export function renumberRowXml(rowXml: string, newRowNum: number): string {
  const rowStr = String(newRowNum);
  let out = rowXml.replace(/(<row\b[^>]*\br=")\d+(")/i, `$1${rowStr}$2`);
  out = out.replace(
    /(<c\b[^>]*\br=")([A-Z]+)\d+(")/gi,
    `$1$2${rowStr}$3`,
  );
  return out;
}

async function readFirstRowFromSheetFile(
  sheetPath: string,
): Promise<string | null> {
  const { stream } = openTrackedSheetStream(sheetPath, 0);
  for await (const row of iterateSheetRowsFromReadable(stream)) {
    return row;
  }
  return null;
}

export async function readFirstOutputRowFromSheet(
  sheetPath: string,
): Promise<string | null> {
  return readFirstRowFromSheetFile(sheetPath);
}

/** Track bytes consumed from disk (excluding unread buffer tail). */
async function* iterateRowsWithOffsets(
  sourcePath: string,
  readStart: number,
): AsyncGenerator<{ row: string; endOffset: number }> {
  let buffer = "";
  const { stream, getOffset } = openTrackedSheetStream(sourcePath, readStart);
  const reader = stream[Symbol.asyncIterator]();

  while (true) {
    let start = buffer.indexOf("<row");
    while (start !== -1) {
      const end = buffer.indexOf("</row>", start);
      if (end === -1) break;
      const row = buffer.slice(start, end + 6);
      buffer = buffer.slice(end + 6);
      const endOffset = getOffset() - Buffer.byteLength(buffer, "utf8");
      yield { row, endOffset };
      start = buffer.indexOf("<row");
    }

    if (buffer.includes("</sheetData>")) {
      break;
    }

    if (buffer.length > 1024_000) {
      const lastRow = buffer.lastIndexOf("<row");
      buffer = lastRow >= 0 ? buffer.slice(lastRow) : "";
    }

    const next = await reader.next();
    if (next.done) break;
    buffer +=
      typeof next.value === "string"
        ? next.value
        : Buffer.from(next.value).toString("utf8");
  }

  const tailStart = buffer.indexOf("<row");
  if (tailStart !== -1 && !buffer.includes("</sheetData>", tailStart)) {
    const tailEnd = buffer.indexOf("</row>", tailStart);
    if (tailEnd !== -1) {
      yield {
        row: buffer.slice(tailStart, tailEnd + 6),
        endOffset: getOffset() - Buffer.byteLength(buffer, "utf8"),
      };
    }
  }
}

function resolveReadStart(
  sourcePath: string,
  bodyStart: number,
  resume: FilterSheetResume | undefined,
  resuming: boolean,
): number {
  if (!resuming || resume?.sourceOffset == null) {
    return bodyStart;
  }
  const offset = resume.sourceOffset;
  if (offset <= bodyStart) return bodyStart;
  if (!isRowBoundaryOffset(sourcePath, offset)) {
    return bodyStart;
  }
  const fileSize = statSync(sourcePath).size;
  if (offset >= fileSize - 32) {
    return fileSize;
  }
  return offset;
}

/** Filter worksheet rows from a local extracted .xml file (fast path). */
export async function streamFilterSheetFromFile(
  sourcePath: string,
  destPath: string,
  options: StreamFilterSheetOptions,
): Promise<StreamFilterSheetResult> {
  const checkpointEvery = options.checkpointEvery ?? CHECKPOINT_EVERY_DEFAULT;
  const resume = options.resume;
  const resuming = resume != null && resume.appendPartial && existsSync(destPath);
  const sharedStrings = options.sharedStrings;
  const filterMode = options.allowedTranIds ? "DETAIL_TRAN_ID" : "SUMMARY";

  const { prefix, bodyStart } = readSheetPrefixFromFile(sourcePath);
  const estimatedMaxRow = parseDimensionMaxRow(prefix);
  const readStart = resolveReadStart(sourcePath, bodyStart, resume, resuming);
  const resumeAfterRow = resuming ? (resume?.lastRowNum ?? 0) : 0;

  const writer = createWriteStream(destPath, {
    encoding: "utf8",
    flags: resuming ? "a" : "w",
    highWaterMark: 4 * 1024 * 1024,
  });

  if (!resuming) {
    writer.write(compactSheetPrefix(prefix));
  }

  let provFilter: ProvColumnFilter | null = null;

  if (resuming) {
    if (filterMode === "DETAIL_TRAN_ID" && resume?.tranIdCol) {
      provFilter = provFilterFromColumns(
        resume.prov1Col ?? "",
        resume.prov2Col ?? "",
        resume.subFundCol,
        resume.sumsCostCol,
        options.filterProv1,
        options.filterProv2,
        options.filterSubFundContains,
        options.filterSumsCostEquals,
        {
          tranIdCol: resume.tranIdCol,
          allowedTranIds: options.allowedTranIds,
        },
      );
    } else if (
      filterMode === "SUMMARY" &&
      resume?.prov1Col &&
      resume?.prov2Col &&
      resume?.subFundCol &&
      resume?.sumsCostCol
    ) {
      provFilter = provFilterFromColumns(
        resume.prov1Col,
        resume.prov2Col,
        resume.subFundCol,
        resume.sumsCostCol,
        options.filterProv1,
        options.filterProv2,
        options.filterSubFundContains,
        options.filterSumsCostEquals,
      );
    } else {
      const headerRow = await readFirstRowFromSheetFile(destPath);
      if (!headerRow) {
        throw new Error(
          "Resume failed — ให้เลือก เริ่มใหม่ (r) แล้วรันอีกครั้ง",
        );
      }
      provFilter = buildProvColumnFilter(
        headerRow,
        sharedStrings,
        options.filterProv1,
        options.filterProv2,
        options.filterSubFundContains,
        options.filterSumsCostEquals,
        {
          mode: filterMode,
          allowedTranIds: options.allowedTranIds,
        },
      );
    }
  }

  let rowsKept = resume?.rowsKept ?? 0;
  let rowsSkipped = resume?.rowsSkipped ?? 0;
  let rowsScanned = resumeAfterRow;
  let lastRowNum = resumeAfterRow;
  let lastEndOffset = readStart;
  let headerWritten = resuming;
  let paused = false;
  let lastCheckpointAt = rowsScanned;
  let liveEstimatedMaxRow = estimatedMaxRow;
  let writeBuffer = "";
  let skippingRows = false;
  let headerScanRows = 0;
  // Header = row 1; data rows continue at 2… (rowsKept counts data rows only).
  let outputRowNum = resuming ? rowsKept + 2 : 1;

  function writeFallbackHeader(): void {
    if (headerWritten || !options.fallbackProvFilter) return;
    provFilter = options.fallbackProvFilter;
    headerWritten = true;
    if (options.fallbackHeaderRowXml) {
      queueWrite(renumberRowXml(options.fallbackHeaderRowXml, outputRowNum));
      outputRowNum++;
    }
  }

  // DETAIL sheet 2+: reuse sheet-1 PROV/TRAN_ID columns; all source rows are data.
  if (!resuming && options.fallbackProvFilter) {
    writeFallbackHeader();
  }

  function flushWrites() {
    if (writeBuffer.length === 0) return;
    writer.write(writeBuffer);
    writeBuffer = "";
  }

  function queueWrite(chunk: string) {
    writeBuffer += chunk;
    if (writeBuffer.length >= WRITE_BUFFER_BYTES) {
      flushWrites();
    }
  }

  function progressPayload(): FilterSheetProgress {
    return {
      rowsKept,
      rowsSkipped,
      rowsScanned,
      estimatedMaxRow: liveEstimatedMaxRow,
      prov1Col: provFilter?.prov1Col,
      prov2Col: provFilter?.prov2Col,
      subFundCol: provFilter?.subFundCol,
      sumsCostCol: provFilter?.sumsCostCol,
      tranIdCol: provFilter?.tranIdCol,
      skippingRows,
      lastRowNum,
      sourceOffset: lastEndOffset,
    };
  }

  function emitProgress(force = false) {
    if (!options.onProgress) return;
    if (!force && rowsScanned % PROGRESS_EVERY !== 0) return;
    options.onProgress(progressPayload());
  }

  function maybeCheckpoint(force = false) {
    if (!options.onCheckpoint) return;
    if (!force && rowsScanned - lastCheckpointAt < checkpointEvery) return;
    lastCheckpointAt = rowsScanned;
    void Promise.resolve(options.onCheckpoint(progressPayload())).catch(() => {});
  }

  if (readStart >= statSync(sourcePath).size - 32) {
    flushWrites();
    if (!headerWritten || !provFilter) {
      throw new Error("Resume failed — ให้เลือก เริ่มใหม่ (r) แล้วรันอีกครั้ง");
    }
    writer.write(DEFAULT_SHEET_SUFFIX);
    await finished(writer);
    return {
      rowsKept,
      rowsSkipped,
      rowsScanned,
      estimatedMaxRow: liveEstimatedMaxRow,
      prov1Col: provFilter.prov1Col,
      prov2Col: provFilter.prov2Col,
      subFundCol: provFilter.subFundCol,
      sumsCostCol: provFilter.sumsCostCol,
      tranIdCol: provFilter.tranIdCol,
      paused: false,
      lastRowNum,
      sourceOffset: readStart,
    };
  }

  for await (const { row: rowXml, endOffset } of iterateRowsWithOffsets(
    sourcePath,
    readStart,
  )) {
    lastEndOffset = endOffset;

    if (options.shouldStop?.()) {
      paused = true;
      flushWrites();
      maybeCheckpoint(true);
      break;
    }

    if (!headerWritten) {
      if (!headerRowHasData(rowXml)) continue;

      const headerFilter = tryBuildProvColumnFilter(
        rowXml,
        sharedStrings,
        options.filterProv1,
        options.filterProv2,
        options.filterSubFundContains,
        options.filterSumsCostEquals,
        {
          mode: filterMode,
          allowedTranIds: options.allowedTranIds,
        },
      );

      if (headerFilter) {
        provFilter = headerFilter;
        queueWrite(renumberRowXml(rowXml, outputRowNum));
        outputRowNum++;
        headerWritten = true;
        const rowNum = parseRowNumber(rowXml);
        if (rowNum != null) {
          lastRowNum = rowNum;
          rowsScanned = rowNum;
        }
        maybeCheckpoint(true);
        continue;
      }

      headerScanRows++;
      if (headerScanRows < HEADER_SCAN_MAX_ROWS) {
        continue;
      }

      throw new Error(
        sharedStrings.length === 0
          ? "Could not load sharedStrings — ลบโฟลเดอร์ .prune-tmp แล้วรันใหม่"
          : filterMode === "DETAIL_TRAN_ID"
            ? "DETAIL sheet is missing TRAN_ID column."
            : "Sheet is missing PROV1, PROV2, SUB_FUND, or SUMS_COST column.",
      );
    }

    const rowNum = parseRowNumber(rowXml);
    if (rowNum != null) {
      rowsScanned = rowNum;
      if (liveEstimatedMaxRow != null && rowNum > liveEstimatedMaxRow) {
        liveEstimatedMaxRow = rowNum;
      }
    }

    if (rowNum != null && rowNum <= resumeAfterRow) {
      skippingRows = true;
      if (rowNum % 50_000 === 0) {
        emitProgress(true);
      }
      continue;
    }

    skippingRows = false;

    if (!provFilter) {
      continue;
    }

    if (rowMatchesProvFast(rowXml, provFilter, sharedStrings)) {
      queueWrite(renumberRowXml(rowXml, outputRowNum));
      outputRowNum++;
      rowsKept++;
    } else {
      rowsSkipped++;
    }

    if (rowNum != null) {
      lastRowNum = rowNum;
    }

    emitProgress();
    maybeCheckpoint();

    if (
      rowNum != null &&
      liveEstimatedMaxRow != null &&
      rowNum >= liveEstimatedMaxRow
    ) {
      break;
    }
  }

  flushWrites();

  if (!headerWritten || !provFilter) {
    writeFallbackHeader();
  }

  if (!headerWritten || !provFilter) {
    writer.destroy();
    throw new Error(
      resuming
        ? "Resume failed — เลือก เริ่มใหม่ (r) แล้วรันอีกครั้ง"
        : "Sheet has no header row.",
    );
  }

  if (paused) {
    writer.end();
    await finished(writer);
    return {
      rowsKept,
      rowsSkipped,
      rowsScanned,
      estimatedMaxRow: liveEstimatedMaxRow,
      prov1Col: provFilter.prov1Col,
      prov2Col: provFilter.prov2Col,
      subFundCol: provFilter.subFundCol,
      sumsCostCol: provFilter.sumsCostCol,
      tranIdCol: provFilter.tranIdCol,
      paused: true,
      lastRowNum,
      sourceOffset: lastEndOffset,
    };
  }

  writer.write(DEFAULT_SHEET_SUFFIX);
  options.onProgress?.({ ...progressPayload(), phase: "ปิดไฟล์ sheet" });
  writer.end();
  await finished(writer);

  return {
    rowsKept,
    rowsSkipped,
    rowsScanned,
    estimatedMaxRow: liveEstimatedMaxRow,
    prov1Col: provFilter.prov1Col,
    prov2Col: provFilter.prov2Col,
    subFundCol: provFilter.subFundCol,
    sumsCostCol: provFilter.sumsCostCol,
    tranIdCol: provFilter.tranIdCol,
    paused: false,
    lastRowNum,
    sourceOffset: lastEndOffset,
  };
}
