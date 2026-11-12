import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import path from "path";
import { findResumableCheckpoint, type PruneCheckpoint } from "./prune-checkpoint";

export type PruneStateEntry = {
  fileName: string;
  size: number;
  mtimeMs: number;
  prunedAt: string;
  outputPath: string;
  rowsKept: number;
  rowsSkipped: number;
};

export type PruneStateFile = {
  version: 1;
  entries: Record<string, PruneStateEntry>;
};

export type FileListItem = {
  fileName: string;
  filePath: string;
  target: "SUMMARY" | "DETAIL";
  status: "NEW" | "DONE" | "RESUME";
  size: number;
  mtimeMs: number;
  checkpointSheetsDone?: number;
  checkpoint?: PruneCheckpoint;
};

const STATE_FILE_NAME = ".prune-state.json";

export function getStateFilePath(dataDir: string): string {
  return path.join(dataDir, STATE_FILE_NAME);
}

export function loadPruneState(dataDir: string): PruneStateFile {
  const statePath = getStateFilePath(dataDir);
  if (!existsSync(statePath)) {
    return { version: 1, entries: {} };
  }

  try {
    const raw = readFileSync(statePath, "utf8");
    const parsed = JSON.parse(raw) as PruneStateFile;
    if (parsed.version !== 1 || !parsed.entries) {
      return { version: 1, entries: {} };
    }
    return parsed;
  } catch {
    return { version: 1, entries: {} };
  }
}

export function savePruneState(dataDir: string, state: PruneStateFile): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(getStateFilePath(dataDir), JSON.stringify(state, null, 2), "utf8");
}

export function isPruneCandidateFileName(fileName: string): boolean {
  const upper = fileName.toUpperCase();
  if (!fileName.toLowerCase().endsWith(".xlsx")) return false;
  if (upper.includes("PRUNE")) return false;
  const hasSum = upper.includes("SUM");
  const hasDetail = upper.includes("DETAIL");
  return (hasSum && !hasDetail) || (hasDetail && !hasSum);
}

export function detectTargetFromFileName(
  fileName: string,
): "SUMMARY" | "DETAIL" | null {
  const upper = fileName.toUpperCase();
  const hasSum = upper.includes("SUM");
  const hasDetail = upper.includes("DETAIL");
  if (hasSum && !hasDetail) return "SUMMARY";
  if (hasDetail && !hasSum) return "DETAIL";
  return null;
}

export function resolveFileStatus(
  fileName: string,
  size: number,
  mtimeMs: number,
  outputPath: string,
  state: PruneStateFile,
): "NEW" | "DONE" {
  const entry = state.entries[fileName];
  const outputExists = existsSync(outputPath);

  if (!outputExists) return "NEW";
  if (!entry) return "NEW";

  const sourceChanged = entry.size !== size || entry.mtimeMs !== mtimeMs;
  if (sourceChanged) return "NEW";

  return "DONE";
}

export function listPruneCandidates(
  dataDir: string,
  outputDir: string,
  state: PruneStateFile,
  filterProv1 = "4000",
  filterProv2 = "4000",
  filterSubFundContains = "WALKIN",
  filterSumsCostEquals = 0,
): FileListItem[] {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
    return [];
  }

  const files = readdirSync(dataDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter(isPruneCandidateFileName)
    .sort((a, b) => {
      const targetA = detectTargetFromFileName(a);
      const targetB = detectTargetFromFileName(b);
      if (targetA !== targetB) {
        return targetA === "SUMMARY" ? -1 : 1;
      }
      return a.localeCompare(b);
    });

  return files.flatMap((fileName) => {
    const target = detectTargetFromFileName(fileName);
    if (!target) return [];

    const filePath = path.join(dataDir, fileName);
    const stat = statSync(filePath);
    const base = path.basename(fileName, path.extname(fileName));
    const outputPath = path.join(outputDir, `${base}Prune.xlsx`);
    const checkpoint = findResumableCheckpoint(
      fileName,
      stat.size,
      stat.mtimeMs,
      filterProv1,
      filterProv2,
      filterSubFundContains,
      filterSumsCostEquals,
    );

    let status: FileListItem["status"] = resolveFileStatus(
      fileName,
      stat.size,
      stat.mtimeMs,
      outputPath,
      state,
    );
    if (checkpoint && status !== "DONE") {
      status = "RESUME";
    }

    return [
      {
        fileName,
        filePath,
        target,
        status,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        checkpointSheetsDone: checkpoint?.completedSheets.length,
        checkpoint: checkpoint ?? undefined,
      },
    ];
  });
}

export function findFirstPendingItem(items: FileListItem[]): FileListItem | null {
  return items.find((item) => item.status !== "DONE") ?? null;
}

export function upsertPruneStateEntry(
  state: PruneStateFile,
  entry: PruneStateEntry,
): PruneStateFile {
  return {
    ...state,
    entries: {
      ...state.entries,
      [entry.fileName]: entry,
    },
  };
}
