import { existsSync, mkdirSync, rmSync, statSync } from "fs";
import path from "path";
import type { UploadTargetType } from "./eclaim-schema";
import {
  clearCheckpoint,
  clearJobWorkDir,
  jobWorkDir,
  loadCheckpoint,
  PrunePausedError,
  saveCheckpoint,
  type PruneCheckpoint,
  type SheetCheckpoint,
} from "./prune-checkpoint";
import {
  ensurePruneSourceExtracted,
  formatEnospcHint,
  isEnospcError,
  isRowBoundaryOffset,
  loadSharedStringsCached,
  preparePruneJob,
  rebuildXlsxFromWorkDir,
  sourceSheetPath,
  trimWorkbookToSheets,
  type SheetEntry,
} from "./xlsx-stream-core";
import { streamFilterSheetFromFile } from "./xlsx-stream-write";

export type PruneResult = {
  outputPath: string;
  rowsKept: number;
  rowsSkipped: number;
  sheetsProcessed: number;
  rowsPerSheet: Record<string, number>;
  paused?: boolean;
};

export type PruneProgressEvent = {
  phase: string;
  sheetIndex: number;
  sheetCount: number;
  rowsKept: number;
  rowsSkipped: number;
  rowsScanned: number;
  sheetEstimatedMaxRow: number | null;
};

export type PruneOptions = {
  filterProv1: string;
  filterProv2: string;
  outputDir: string;
  resume?: boolean;
  maxRuntimeMs?: number;
  onProgress?: (progress: PruneProgressEvent) => void;
};

const DEFAULT_MAX_RUNTIME_MS = 60 * 60 * 1000;

function pruneOutputFileName(sourceFileName: string): string {
  const ext = path.extname(sourceFileName);
  const base = path.basename(sourceFileName, ext);
  return `${base}Prune${ext}`;
}

function wrapEnospc(error: unknown): Error {
  if (isEnospcError(error)) {
    return new Error(formatEnospcHint());
  }
  if (error instanceof Error) return error;
  return new Error(String(error));
}

function repairSheetCheckpoint(
  sheet: SheetCheckpoint,
  sourcePath: string,
): SheetCheckpoint {
  if (sheet.lastRowNum != null && sheet.lastRowNum > 0) {
    return sheet;
  }

  const kept = sheet.rowsKept + sheet.rowsSkipped;
  if (kept > 0 && sheet.estimatedMaxRow != null) {
    const ratio = kept / sheet.estimatedMaxRow;
    if (ratio > 0.05 && ratio < 1.5) {
      return {
        ...sheet,
        lastRowNum: Math.min(
          sheet.estimatedMaxRow,
          Math.round(sheet.estimatedMaxRow * ratio),
        ),
        sourceOffset: undefined,
      };
    }
  }

  if (
    sheet.sourceOffset != null &&
    existsSync(sourcePath) &&
    !isRowBoundaryOffset(sourcePath, sheet.sourceOffset)
  ) {
    return { ...sheet, sourceOffset: undefined };
  }

  return sheet;
}

function sheetOutputPath(workDir: string, sheet: SheetEntry): string {
  return path.join(workDir, "xl", "worksheets", sheet.sheetXmlName);
}

function resumeSheetState(
  sheet: SheetCheckpoint,
  sourcePath: string,
): SheetCheckpoint {
  const repaired = repairSheetCheckpoint(sheet, sourcePath);
  if (
    repaired.lastRowNum == null &&
    repaired.rowsScanned > (repaired.estimatedMaxRow ?? 0) * 1.1
  ) {
    throw new Error(
      "Checkpoint เสีย — เลือก เริ่มใหม่ (r) แล้วรันอีกครั้ง",
    );
  }
  return repaired;
}

function buildCheckpoint(
  base: Omit<
    PruneCheckpoint,
    "completedSheets" | "currentSheet" | "totalRowsKept" | "totalRowsSkipped" | "updatedAt"
  >,
  completedSheets: SheetCheckpoint[],
  currentSheet: SheetCheckpoint | null,
  totalRowsKept: number,
  totalRowsSkipped: number,
): PruneCheckpoint {
  return {
    ...base,
    completedSheets,
    currentSheet,
    totalRowsKept,
    totalRowsSkipped,
    updatedAt: new Date().toISOString(),
  };
}

export async function pruneXlsxFile(
  xlsxPath: string,
  target: UploadTargetType,
  options: PruneOptions,
): Promise<PruneResult> {
  const fileName = path.basename(xlsxPath);
  const { size: fileSize, mtimeMs } = statSync(xlsxPath);
  const outputFileName = pruneOutputFileName(fileName);
  const outputPath = path.join(options.outputDir, outputFileName);
  const persistentWorkDir = jobWorkDir(fileName);
  const maxRuntimeMs = options.maxRuntimeMs ?? DEFAULT_MAX_RUNTIME_MS;
  const startedAt = Date.now();

  let existingCheckpoint =
    options.resume !== false ? loadCheckpoint(persistentWorkDir) : null;

  if (
    existingCheckpoint &&
    (existingCheckpoint.fileName !== fileName ||
      existingCheckpoint.fileSize !== fileSize ||
      existingCheckpoint.mtimeMs !== mtimeMs ||
      existingCheckpoint.filterProv1 !== options.filterProv1 ||
      existingCheckpoint.filterProv2 !== options.filterProv2)
  ) {
    clearJobWorkDir(persistentWorkDir);
    existingCheckpoint = null;
  }

  if (options.resume === false && existsSync(persistentWorkDir)) {
    clearJobWorkDir(persistentWorkDir);
    existingCheckpoint = null;
  }

  let workDir = "";
  let keepWorkDir = false;

  const checkpointBase = {
    version: 1 as const,
    fileName,
    fileSize,
    mtimeMs,
    filterProv1: options.filterProv1,
    filterProv2: options.filterProv2,
    target,
    workDir: persistentWorkDir,
  };

  let completedSheets: SheetCheckpoint[] =
    existingCheckpoint?.completedSheets.filter((s) => s.complete) ?? [];
  let currentSheetState: SheetCheckpoint | null =
    existingCheckpoint?.currentSheet ?? null;
  let totalRowsKept = existingCheckpoint?.totalRowsKept ?? 0;
  let totalRowsSkipped = existingCheckpoint?.totalRowsSkipped ?? 0;

  try {
    const prepared = await preparePruneJob(xlsxPath, target, persistentWorkDir);
    workDir = prepared.workDir;
    const { sheets } = prepared;

    options.onProgress?.({
      phase: "แตกไฟล์ source",
      sheetIndex: 1,
      sheetCount: sheets.length,
      rowsKept: totalRowsKept,
      rowsSkipped: totalRowsSkipped,
      rowsScanned: 0,
      sheetEstimatedMaxRow: null,
    });

    ensurePruneSourceExtracted(
      xlsxPath,
      workDir,
      sheets,
      fileSize,
      mtimeMs,
    );

    const sharedStrings = await loadSharedStringsCached(workDir);

    options.onProgress?.({
      phase: "เตรียมกรอง",
      sheetIndex: 1,
      sheetCount: sheets.length,
      rowsKept: totalRowsKept,
      rowsSkipped: totalRowsSkipped,
      rowsScanned: 0,
      sheetEstimatedMaxRow: null,
    });

    const rowsPerSheet: Record<string, number> = {};
    for (const sheet of completedSheets) {
      rowsPerSheet[String(sheet.sheetIndex)] = sheet.rowsKept;
    }

    let sheetsProcessed = completedSheets.length;

    for (const sheet of sheets) {
      if (completedSheets.some((s) => s.sheetIndex === sheet.sheetIndex)) {
        continue;
      }

      const sheetPath = sheetOutputPath(workDir, sheet);
      mkdirSync(path.dirname(sheetPath), { recursive: true });

      const srcPath = sourceSheetPath(workDir, sheet);
      const rawResume =
        currentSheetState?.sheetIndex === sheet.sheetIndex
          ? currentSheetState
          : null;
      const resumeSheet = rawResume
        ? resumeSheetState(rawResume, srcPath)
        : null;

      options.onProgress?.({
        phase: resumeSheet ? "ทำต่อกรองแถว" : "กรองแถว",
        sheetIndex: sheet.sheetIndex,
        sheetCount: sheets.length,
        rowsKept: totalRowsKept,
        rowsSkipped: totalRowsSkipped,
        rowsScanned: resumeSheet?.lastRowNum ?? resumeSheet?.rowsScanned ?? 0,
        sheetEstimatedMaxRow: resumeSheet?.estimatedMaxRow ?? null,
      });

      const runningSheet: SheetCheckpoint = {
        sheetIndex: sheet.sheetIndex,
        sheetXmlName: sheet.sheetXmlName,
        zipEntry: sheet.zipEntry,
        sheetName: sheet.sheetName,
        rowsScanned: resumeSheet?.lastRowNum ?? resumeSheet?.rowsScanned ?? 0,
        rowsKept: resumeSheet?.rowsKept ?? 0,
        rowsSkipped: resumeSheet?.rowsSkipped ?? 0,
        estimatedMaxRow: resumeSheet?.estimatedMaxRow ?? null,
        prov1Col: resumeSheet?.prov1Col,
        prov2Col: resumeSheet?.prov2Col,
        lastRowNum: resumeSheet?.lastRowNum,
        sourceOffset: resumeSheet?.sourceOffset,
        complete: false,
      };

      currentSheetState = runningSheet;
      saveCheckpoint(
        workDir,
        buildCheckpoint(
          checkpointBase,
          completedSheets,
          runningSheet,
          totalRowsKept,
          totalRowsSkipped,
        ),
      );

      const result = await streamFilterSheetFromFile(
        sourceSheetPath(workDir, sheet),
        sheetPath,
        {
          filterProv1: options.filterProv1,
          filterProv2: options.filterProv2,
          sharedStrings,
          resume: resumeSheet
            ? {
                rowsKept: resumeSheet.rowsKept,
                rowsSkipped: resumeSheet.rowsSkipped,
                appendPartial: existsSync(sheetPath),
                prov1Col: resumeSheet.prov1Col,
                prov2Col: resumeSheet.prov2Col,
                lastRowNum: resumeSheet.lastRowNum,
                sourceOffset: resumeSheet.sourceOffset,
              }
            : undefined,
          checkpointEvery: 100_000,
          shouldStop: () => Date.now() - startedAt >= maxRuntimeMs,
          onProgress: (p) => {
            runningSheet.rowsScanned = p.rowsScanned;
            runningSheet.rowsKept = p.rowsKept;
            runningSheet.rowsSkipped = p.rowsSkipped;
            runningSheet.estimatedMaxRow = p.estimatedMaxRow;
            runningSheet.prov1Col = p.prov1Col;
            runningSheet.prov2Col = p.prov2Col;
            runningSheet.lastRowNum = p.lastRowNum;
            runningSheet.sourceOffset = p.sourceOffset;

            const priorKept = completedSheets.reduce((sum, s) => sum + s.rowsKept, 0);
            const priorSkipped = completedSheets.reduce(
              (sum, s) => sum + s.rowsSkipped,
              0,
            );

            options.onProgress?.({
              phase:
                p.phase ??
                (p.skippingRows ? "ข้ามแถวเก่า" : "กรองแถว"),
              sheetIndex: sheet.sheetIndex,
              sheetCount: sheets.length,
              rowsKept: priorKept + p.rowsKept,
              rowsSkipped: priorSkipped + p.rowsSkipped,
              rowsScanned: p.rowsScanned,
              sheetEstimatedMaxRow: p.estimatedMaxRow,
            });
          },
          onCheckpoint: (p) => {
            runningSheet.rowsScanned = p.rowsScanned;
            runningSheet.rowsKept = p.rowsKept;
            runningSheet.rowsSkipped = p.rowsSkipped;
            runningSheet.estimatedMaxRow = p.estimatedMaxRow;
            runningSheet.prov1Col = p.prov1Col;
            runningSheet.prov2Col = p.prov2Col;
            runningSheet.lastRowNum = p.lastRowNum;
            runningSheet.sourceOffset = p.sourceOffset;
            saveCheckpoint(
              workDir,
              buildCheckpoint(
                checkpointBase,
                completedSheets,
                runningSheet,
                completedSheets.reduce((sum, s) => sum + s.rowsKept, 0) + p.rowsKept,
                completedSheets.reduce((sum, s) => sum + s.rowsSkipped, 0) +
                  p.rowsSkipped,
              ),
            );
          },
        },
      );

      if (result.paused) {
        runningSheet.rowsScanned = result.rowsScanned;
        runningSheet.rowsKept = result.rowsKept;
        runningSheet.rowsSkipped = result.rowsSkipped;
        runningSheet.estimatedMaxRow = result.estimatedMaxRow;
        runningSheet.lastRowNum = result.lastRowNum;
        runningSheet.sourceOffset = result.sourceOffset;
        const pausedCheckpoint = buildCheckpoint(
          checkpointBase,
          completedSheets,
          runningSheet,
          completedSheets.reduce((sum, s) => sum + s.rowsKept, 0) + result.rowsKept,
          completedSheets.reduce((sum, s) => sum + s.rowsSkipped, 0) +
            result.rowsSkipped,
        );
        saveCheckpoint(workDir, pausedCheckpoint);
        keepWorkDir = true;
        throw new PrunePausedError(pausedCheckpoint);
      }

      const doneSheet: SheetCheckpoint = {
        ...runningSheet,
        rowsScanned: result.rowsScanned,
        rowsKept: result.rowsKept,
        rowsSkipped: result.rowsSkipped,
        estimatedMaxRow: result.estimatedMaxRow,
        prov1Col: result.prov1Col,
        prov2Col: result.prov2Col,
        lastRowNum: result.lastRowNum,
        sourceOffset: result.sourceOffset,
        complete: true,
      };
      completedSheets = [...completedSheets, doneSheet];
      currentSheetState = null;
      totalRowsKept = completedSheets.reduce((sum, s) => sum + s.rowsKept, 0);
      totalRowsSkipped = completedSheets.reduce(
        (sum, s) => sum + s.rowsSkipped,
        0,
      );
      rowsPerSheet[String(sheet.sheetIndex)] = result.rowsKept;
      sheetsProcessed++;

      saveCheckpoint(
        workDir,
        buildCheckpoint(
          checkpointBase,
          completedSheets,
          null,
          totalRowsKept,
          totalRowsSkipped,
        ),
      );
    }

    trimWorkbookToSheets(workDir, sheets);

    options.onProgress?.({
      phase: "รวมไฟล์ xlsx",
      sheetIndex: sheets.length,
      sheetCount: sheets.length,
      rowsKept: totalRowsKept,
      rowsSkipped: totalRowsSkipped,
      rowsScanned: 0,
      sheetEstimatedMaxRow: null,
    });

    mkdirSync(path.dirname(outputPath), { recursive: true });
    rebuildXlsxFromWorkDir(xlsxPath, workDir, outputPath, sheets);

    clearCheckpoint(workDir);
    clearJobWorkDir(workDir);

    return {
      outputPath,
      rowsKept: totalRowsKept,
      rowsSkipped: totalRowsSkipped,
      sheetsProcessed,
      rowsPerSheet,
    };
  } catch (error) {
    if (error instanceof PrunePausedError) {
      keepWorkDir = true;
      return {
        outputPath,
        rowsKept: error.checkpoint.totalRowsKept,
        rowsSkipped: error.checkpoint.totalRowsSkipped,
        sheetsProcessed: error.checkpoint.completedSheets.length,
        rowsPerSheet: Object.fromEntries(
          error.checkpoint.completedSheets.map((s) => [String(s.sheetIndex), s.rowsKept]),
        ),
        paused: true,
      };
    }
    throw wrapEnospc(error);
  } finally {
    if (workDir && !keepWorkDir && workDir !== persistentWorkDir) {
      try {
        rmSync(workDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

export function getPruneOutputPath(sourcePath: string, outputDir: string): string {
  return path.join(outputDir, pruneOutputFileName(path.basename(sourcePath)));
}
