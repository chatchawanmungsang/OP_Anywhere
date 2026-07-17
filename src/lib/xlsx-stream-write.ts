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
  type ProvColumnFilter,
} from "./xlsx-prov-filter";

const DEFAULT_SHEET_SUFFIX = "</sheetData></worksheet>";
const WRITE_BUFFER_BYTES = 2 * 1024 * 1024;
const CHECKPOINT_EVERY_DEFAULT = 100_000;
const PROGRESS_EVERY = 5_000;

export type FilterSheetProgress = {
  rowsKept: number;
  rowsSkipped: number;
  rowsScanned: number;
  estimatedMaxRow: number | null;
  prov1Col?: string;
  prov2Col?: string;
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
  /** @deprecated Legacy — ignored when lastRowNum is set. */
  rowsScanned?: number;
  lastRowNum?: number;
  sourceOffset?: number;
};

export type StreamFilterSheetOptions = {
  filterProv1: string;
  filterProv2: string;
  sharedStrings: string[];
  resume?: FilterSheetResume;
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

async function readFirstRowFromSheetFile(
  sheetPath: string,
): Promise<string | null> {
  const { stream } = openTrackedSheetStream(sheetPath, 0);
  for await (const row of iterateSheetRowsFromReadable(stream)) {
    return row;
  }
  return null;
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
    writer.write(prefix);
  }

  let provFilter: ProvColumnFilter | null = null;

  if (resuming) {
    if (resume?.prov1Col && resume?.prov2Col) {
      provFilter = provFilterFromColumns(
        resume.prov1Col,
        resume.prov2Col,
        options.filterProv1,
        options.filterProv2,
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
      provFilter = buildProvColumnFilter(
        rowXml,
        sharedStrings,
        options.filterProv1,
        options.filterProv2,
      );
      queueWrite(rowXml);
      headerWritten = true;
      const rowNum = parseRowNumber(rowXml);
      if (rowNum != null) {
        lastRowNum = rowNum;
        rowsScanned = rowNum;
      }
      maybeCheckpoint(true);
      continue;
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
      queueWrite(rowXml);
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
    paused: false,
    lastRowNum,
    sourceOffset: lastEndOffset,
  };
}
