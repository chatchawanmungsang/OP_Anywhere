import { createReadStream, copyFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { execSync } from "child_process";
import path from "path";
import os from "os";
import {
  buildHeaderIndexMapFromRow,
  columnsForTarget,
  headersMatch,
  expectedExcelHeaders,
  normalizeHeader,
  rowValuesToRecord,
  type UploadTargetType,
} from "./eclaim-schema";

export type StreamImportResult = {
  headers: string[];
  rowCount: number;
  batches: Record<string, unknown>[][];
};

function colRefToIndex(ref: string): number {
  const letters = ref.replace(/[0-9]/g, "").toUpperCase();
  let n = 0;
  for (const ch of letters) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

function parseSharedStrings(sharedPath: string): string[] {
  const fs = require("fs") as typeof import("fs");
  if (!existsSync(sharedPath)) return [];
  const ss = fs.readFileSync(sharedPath, "utf8");
  const strings: string[] = [];
  const siBlocks = ss.match(/<si>[\s\S]*?<\/si>/g) || [];
  for (const block of siBlocks) {
    const parts = [...block.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((m) => m[1]);
    strings.push(parts.join(""));
  }
  return strings;
}

function parseCellValue(
  attrs: string,
  raw: string | undefined,
  sharedStrings: string[],
): string | null {
  if (raw == null) return null;
  if (/\bt="s"/.test(attrs)) {
    return sharedStrings[Number(raw)] ?? null;
  }
  if (/\bt="inlineStr"/.test(attrs)) {
    return raw;
  }
  return raw;
}

function parseRowCells(
  rowXml: string,
  sharedStrings: string[],
): (string | null)[] {
  const cells = [...rowXml.matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)];
  let maxIndex = -1;
  const sparse = new Map<number, string | null>();

  for (const cell of cells) {
    const attrs = cell[1];
    const inner = cell[2];
    const refMatch = attrs.match(/\br="([A-Z]+[0-9]+)"/i);
    const index = refMatch ? colRefToIndex(refMatch[1]) : sparse.size;
    const vMatch = inner.match(/<v>([^<]*)<\/v>/);
    const tMatch = inner.match(/<t[^>]*>([^<]*)<\/t>/);
    let value: string | null = null;
    if (vMatch) {
      value = parseCellValue(attrs, vMatch[1], sharedStrings);
    } else if (tMatch) {
      value = tMatch[1];
    }
    sparse.set(index, value);
    maxIndex = Math.max(maxIndex, index);
  }

  const values: (string | null)[] = [];
  for (let i = 0; i <= maxIndex; i++) {
    values.push(sparse.get(i) ?? null);
  }
  return values;
}

async function* iterateSheetRows(
  sheetPath: string,
): AsyncGenerator<string> {
  const stream = createReadStream(sheetPath, {
    encoding: "utf8",
    highWaterMark: 256 * 1024,
  });

  let buffer = "";
  for await (const chunk of stream) {
    buffer += chunk;
    let start = buffer.indexOf("<row");
    while (start !== -1) {
      const end = buffer.indexOf("</row>", start);
      if (end === -1) break;
      yield buffer.slice(start, end + 6);
      buffer = buffer.slice(end + 6);
      start = buffer.indexOf("<row");
    }
    if (buffer.length > 512_000) {
      const lastRow = buffer.lastIndexOf("<row");
      buffer = lastRow >= 0 ? buffer.slice(lastRow) : "";
    }
  }

  const start = buffer.indexOf("<row");
  if (start !== -1) {
    const end = buffer.indexOf("</row>", start);
    if (end !== -1) yield buffer.slice(start, end + 6);
  }
}

function prepareWorkbook(xlsxPath: string): {
  workDir: string;
  sheetPath: string;
  sharedPath: string;
} {
  const workDir = path.join(
    os.tmpdir(),
    `op-xlsx-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(workDir, { recursive: true });
  const zipPath = path.join(workDir, "book.zip");
  copyFileSync(xlsxPath, zipPath);
  execSync(`tar -xf book.zip xl/sharedStrings.xml xl/worksheets/sheet1.xml`, {
    cwd: workDir,
    stdio: "pipe",
  });
  return {
    workDir,
    sheetPath: path.join(workDir, "xl", "worksheets", "sheet1.xml"),
    sharedPath: path.join(workDir, "xl", "sharedStrings.xml"),
  };
}

export async function streamImportXlsx(
  xlsxPath: string,
  target: UploadTargetType,
  meta: {
    sourceFileName: string;
    uploadedById: string;
    uploadBatchId: string;
  },
  options?: { batchSize?: number; maxRows?: number },
): Promise<StreamImportResult> {
  const batchSize = options?.batchSize ?? 500;
  const maxRows = options?.maxRows;
  const { workDir, sheetPath, sharedPath } = prepareWorkbook(xlsxPath);
  const sharedStrings = parseSharedStrings(sharedPath);
  const columns = columnsForTarget(target);

  let headers: string[] | null = null;
  let headerIndexMap: Map<number, (typeof columns)[0]> | null = null;
  let rowCount = 0;
  const batches: Record<string, unknown>[][] = [];
  let currentBatch: Record<string, unknown>[] = [];

  try {
    for await (const rowXml of iterateSheetRows(sheetPath)) {
      const values = parseRowCells(rowXml, sharedStrings).map((v) =>
        v == null ? null : String(v).trim(),
      );

      const hasData = values.some((v) => v != null && v !== "");
      if (!hasData) continue;

      if (!headers) {
        const foundHeaders = values
          .filter((v): v is string => v != null && v !== "")
          .map((v) => normalizeHeader(v));
        const match = headersMatch(expectedExcelHeaders(target), foundHeaders);
        if (!match.ok) {
          const details = [
            match.missing.length
              ? `missing: ${match.missing.join(", ")}`
              : null,
            match.extra.length ? `extra: ${match.extra.join(", ")}` : null,
          ]
            .filter(Boolean)
            .join("; ");
          throw new Error(
            `Sheet 1 headers do not match SQL schema (${details}).`,
          );
        }
        headers = foundHeaders;
        headerIndexMap = buildHeaderIndexMapFromRow(values, columns);
        continue;
      }

      if (!headerIndexMap) {
        throw new Error("Header map missing after parsing header row.");
      }

      const record = rowValuesToRecord(values, headerIndexMap, meta);
      currentBatch.push(record);
      rowCount++;

      if (currentBatch.length >= batchSize) {
        batches.push(currentBatch);
        currentBatch = [];
      }

      if (maxRows != null && rowCount >= maxRows) break;
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    if (!headers) {
      throw new Error("Sheet 1 has no header row.");
    }

    return { headers, rowCount, batches };
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}
