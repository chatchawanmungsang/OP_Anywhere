import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import path from "path";
import type { UploadTargetType } from "./eclaim-schema";
import { getPruneTempRoot } from "./xlsx-stream-core";

export type SheetCheckpoint = {
  sheetIndex: number;
  sheetXmlName: string;
  zipEntry: string;
  sheetName: string;
  rowsScanned: number;
  rowsKept: number;
  rowsSkipped: number;
  estimatedMaxRow: number | null;
  prov1Col?: string;
  prov2Col?: string;
  /** Last Excel row number (r="N") fully processed — reliable resume marker. */
  lastRowNum?: number;
  /** @deprecated Byte offset — only used when aligned to a row boundary. */
  sourceOffset?: number;
  complete: boolean;
};

export type PruneCheckpoint = {
  version: 1;
  fileName: string;
  fileSize: number;
  mtimeMs: number;
  filterProv1: string;
  filterProv2: string;
  target: UploadTargetType;
  workDir: string;
  completedSheets: SheetCheckpoint[];
  currentSheet: SheetCheckpoint | null;
  totalRowsKept: number;
  totalRowsSkipped: number;
  updatedAt: string;
};

export class PrunePausedError extends Error {
  readonly checkpoint: PruneCheckpoint;

  constructor(checkpoint: PruneCheckpoint) {
    super(
      "หยุดชั่วคราว — รัน npm run prune แล้วเลือกไฟล์เดิมเพื่อทำต่อจากจุดที่ค้างไว้",
    );
    this.name = "PrunePausedError";
    this.checkpoint = checkpoint;
  }
}

export function jobWorkDir(fileName: string): string {
  const base = path.basename(fileName, path.extname(fileName));
  return path.join(getPruneTempRoot(), "jobs", base);
}

function checkpointPath(workDir: string): string {
  return path.join(workDir, "checkpoint.json");
}

export function loadCheckpoint(workDir: string): PruneCheckpoint | null {
  const filePath = checkpointPath(workDir);
  if (!existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as PruneCheckpoint;
    if (parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCheckpoint(workDir: string, checkpoint: PruneCheckpoint): void {
  mkdirSync(workDir, { recursive: true });
  writeFileSync(
    checkpointPath(workDir),
    JSON.stringify({ ...checkpoint, updatedAt: new Date().toISOString() }, null, 2),
    "utf8",
  );
}

export function clearCheckpoint(workDir: string): void {
  const filePath = checkpointPath(workDir);
  if (existsSync(filePath)) rmSync(filePath, { force: true });
}

export function clearJobWorkDir(workDir: string): void {
  if (existsSync(workDir)) {
    rmSync(workDir, { recursive: true, force: true });
  }
}

export function findResumableCheckpoint(
  fileName: string,
  fileSize: number,
  mtimeMs: number,
  filterProv1: string,
  filterProv2: string,
): PruneCheckpoint | null {
  const workDir = jobWorkDir(fileName);
  const checkpoint = loadCheckpoint(workDir);
  if (!checkpoint) return null;
  if (checkpoint.fileName !== fileName) return null;
  if (checkpoint.fileSize !== fileSize || checkpoint.mtimeMs !== mtimeMs) return null;
  if (
    checkpoint.filterProv1 !== filterProv1 ||
    checkpoint.filterProv2 !== filterProv2
  ) {
    return null;
  }
  if (!existsSync(checkpoint.workDir)) return null;
  return checkpoint;
}

export function isCheckpointComplete(checkpoint: PruneCheckpoint): boolean {
  if (checkpoint.currentSheet && !checkpoint.currentSheet.complete) return false;
  return checkpoint.completedSheets.length > 0;
}
