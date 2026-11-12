import { execSync, spawnSync } from "child_process";
import {
  closeSync,
  copyFileSync,
  createReadStream,
  mkdirSync,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import path from "path";
import os from "os";
import type { Readable } from "stream";
import type { UploadTargetType } from "./eclaim-schema";
import { openXlsxEntryStream, readXlsxEntryText } from "./xlsx-zip-stream";

export type SheetEntry = {
  sheetIndex: number;
  sheetName: string;
  sheetPath: string;
  sheetXmlName: string;
  relId: string;
  zipEntry: string;
};

const TAR_SHELL = process.platform === "win32" ? "cmd.exe" : "/bin/sh";

function shellQuote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

/** Run tar without shell so `[Content_Types].xml` etc. are not glob-expanded on Windows. */
function runTar(args: string[], cwd?: string): void {
  const result = spawnSync("tar", args, {
    cwd: cwd ? path.resolve(cwd) : undefined,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(detail || `tar ${args.join(" ")} failed`);
  }
}

export function extractFullXlsx(xlsxPath: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  runTar(["-xf", path.resolve(xlsxPath), "-C", path.resolve(destDir)]);
}

export function getPruneTempRoot(): string {
  if (process.env.PRUNE_TMP_DIR) {
    return path.resolve(process.env.PRUNE_TMP_DIR);
  }
  return path.join(os.tmpdir(), "op-prune");
}

export function colRefToIndex(ref: string): number {
  const letters = ref.replace(/[0-9]/g, "").toUpperCase();
  let n = 0;
  for (const ch of letters) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

/** Stream-parse shared strings from a readable source (file path or zip entry stream). */
export async function loadSharedStringsFromReadable(
  source: Readable,
): Promise<string[]> {
  const strings: string[] = [];
  let buffer = "";

  for await (const chunk of source) {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    buffer += text;

    let pos = 0;
    while (true) {
      const start = buffer.indexOf("<si", pos);
      if (start === -1) {
        // Keep trailing 4 chars in case "<si" is split across chunks
        buffer = buffer.slice(Math.max(pos, buffer.length - 4));
        break;
      }
      const nextChar = buffer[start + 3];
      if (
        nextChar !== undefined &&
        nextChar !== ">" &&
        nextChar !== " " &&
        nextChar !== "/" &&
        nextChar !== "\t" &&
        nextChar !== "\r" &&
        nextChar !== "\n"
      ) {
        pos = start + 3;
        continue;
      }
      const tagEnd = buffer.indexOf(">", start + 3);
      if (tagEnd === -1) {
        buffer = buffer.slice(start);
        break;
      }
      if (buffer[tagEnd - 1] === "/") {
        strings.push("");
        pos = tagEnd + 1;
        continue;
      }
      const end = buffer.indexOf("</si>", tagEnd + 1);
      if (end === -1) {
        buffer = buffer.slice(start);
        break;
      }
      const block = buffer.slice(tagEnd + 1, end);
      const parts = [...block.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(
        (m) => m[1],
      );
      strings.push(parts.join(""));
      pos = end + 5;
    }
  }

  return strings;
}

/** Stream-parse shared strings to avoid loading entire file at once. */
export async function loadSharedStrings(sharedPath: string): Promise<string[]> {
  if (!existsSync(sharedPath)) return [];
  return loadSharedStringsFromReadable(
    createReadStream(sharedPath, {
      encoding: "utf8",
      highWaterMark: 4 * 1024 * 1024,
    }),
  );
}

export async function loadSharedStringsFromXlsx(
  xlsxPath: string,
): Promise<string[]> {
  try {
    return loadSharedStringsFromReadable(
      openXlsxEntryStream(xlsxPath, "xl/sharedStrings.xml"),
    );
  } catch {
    return [];
  }
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

export function parseRowCells(
  rowXml: string,
  sharedStrings: string[],
): (string | null)[] {
  const cells = [...rowXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)];
  let maxIndex = -1;
  const sparse = new Map<number, string | null>();

  for (const cell of cells) {
    const attrs = cell[1];
    const inner = cell[2];
    const refMatch = attrs.match(/\br="([A-Z]+[0-9]+)"/i);
    const index = refMatch ? colRefToIndex(refMatch[1]) : sparse.size;
    let value: string | null = null;
    if (inner != null) {
      const vMatch = inner.match(/<v>([^<]*)<\/v>/);
      const tMatch = inner.match(/<t[^>]*>([^<]*)<\/t>/);
      if (vMatch) {
        value = parseCellValue(attrs, vMatch[1], sharedStrings);
      } else if (tMatch) {
        value = tMatch[1];
      }
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

export async function* iterateSheetRowsFromReadable(
  readable: Readable,
  initialBuffer = "",
): AsyncGenerator<string> {
  let buffer = initialBuffer;
  const reader = readable[Symbol.asyncIterator]();

  while (true) {
    let start = buffer.indexOf("<row");
    while (start !== -1) {
      const end = buffer.indexOf("</row>", start);
      if (end === -1) break;
      yield buffer.slice(start, end + 6);
      buffer = buffer.slice(end + 6);
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

  const start = buffer.indexOf("<row");
  if (start !== -1 && !buffer.includes("</sheetData>", start)) {
    const end = buffer.indexOf("</row>", start);
    if (end !== -1) yield buffer.slice(start, end + 6);
  }
}

export async function* iterateSheetRows(
  sheetPath: string,
  startByte = 0,
): AsyncGenerator<string> {
  yield* iterateSheetRowsFromReadable(
    createReadStream(sheetPath, {
      encoding: "utf8",
      highWaterMark: 4 * 1024 * 1024,
      ...(startByte > 0 ? { start: startByte } : {}),
    }),
  );
}

export function pruneSourceDir(workDir: string): string {
  return path.join(workDir, "_source");
}

export function sourceSheetPath(workDir: string, sheet: SheetEntry): string {
  return path.join(
    pruneSourceDir(workDir),
    "xl",
    "worksheets",
    sheet.sheetXmlName,
  );
}

export function sourceSharedStringsPath(workDir: string): string {
  return path.join(pruneSourceDir(workDir), "xl", "sharedStrings.xml");
}

/** One-time tar extract of worksheets + sharedStrings for fast local reads. */
export function ensurePruneSourceExtracted(
  xlsxPath: string,
  workDir: string,
  sheets: SheetEntry[],
  fileSize: number,
  mtimeMs: number,
): boolean {
  const srcRoot = pruneSourceDir(workDir);
  const markerPath = path.join(srcRoot, ".extracted.json");
  if (existsSync(markerPath)) {
    try {
      const marker = JSON.parse(readFileSync(markerPath, "utf8")) as {
        fileSize: number;
        mtimeMs: number;
      };
      if (marker.fileSize === fileSize && marker.mtimeMs === mtimeMs) {
        return false;
      }
    } catch {
      // re-extract below
    }
  }

  mkdirSync(path.join(srcRoot, "xl", "worksheets"), { recursive: true });
  const entries = [
    "xl/sharedStrings.xml",
    ...sheets.map((s) => s.zipEntry),
  ];
  partialExtractFromXlsx(xlsxPath, srcRoot, entries);
  const cachePath = path.join(workDir, ".shared-strings.cache.json");
  if (existsSync(cachePath)) {
    rmSync(cachePath, { force: true });
  }
  writeFileSync(
    markerPath,
    JSON.stringify({
      fileSize,
      mtimeMs,
      extractedAt: new Date().toISOString(),
    }),
    "utf8",
  );
  return true;
}

/** Read worksheet XML prefix and byte offset where row data begins. */
export function readSheetPrefixFromFile(filePath: string): {
  prefix: string;
  bodyStart: number;
} {
  const fd = openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(131_072);
    const bytesRead = readSync(fd, buf, 0, buf.length, 0);
    const head = buf.toString("utf8", 0, bytesRead);
    const openIdx = head.indexOf("<sheetData");
    if (openIdx === -1) {
      throw new Error("Could not find <sheetData> in worksheet.");
    }
    const closeIdx = head.indexOf(">", openIdx);
    if (closeIdx === -1) {
      throw new Error("Could not parse <sheetData> tag.");
    }
    const prefix = head.slice(0, closeIdx + 1);
    return {
      prefix,
      bodyStart: Buffer.byteLength(prefix, "utf8"),
    };
  } finally {
    closeSync(fd);
  }
}

export function openTrackedSheetStream(
  filePath: string,
  startByte: number,
): { stream: ReturnType<typeof createReadStream>; getOffset: () => number } {
  let offset = startByte;
  const stream = createReadStream(filePath, {
    encoding: "utf8",
    highWaterMark: 4 * 1024 * 1024,
    ...(startByte > 0 ? { start: startByte } : {}),
  });
  stream.on("data", (chunk: string | Buffer) => {
    offset +=
      typeof chunk === "string"
        ? Buffer.byteLength(chunk, "utf8")
        : chunk.length;
  });
  return { stream, getOffset: () => offset };
}

/** True when `offset` in a worksheet file points at the start of a <row> element. */
export function isRowBoundaryOffset(filePath: string, offset: number): boolean {
  if (offset <= 0) return true;
  const fd = openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(64);
    const bytesRead = readSync(fd, buf, 0, buf.length, offset);
    const head = buf.toString("utf8", 0, bytesRead).trimStart();
    return head.startsWith("<row") || head.startsWith("</sheetData>");
  } finally {
    closeSync(fd);
  }
}

export function loadSharedStringsCached(workDir: string): Promise<string[]> {
  const cachePath = path.join(workDir, ".shared-strings.cache.json");
  const sourcePath = sourceSharedStringsPath(workDir);
  if (!existsSync(sourcePath)) return Promise.resolve([]);

  const sourceSize = statSync(sourcePath).size;

  if (existsSync(cachePath)) {
    try {
      const raw = JSON.parse(readFileSync(cachePath, "utf8")) as
        | string[]
        | { sourceSize?: number; strings?: string[] };
      const cachedStrings = Array.isArray(raw) ? raw : raw.strings;
      const cachedSize = Array.isArray(raw) ? null : raw.sourceSize;
      if (
        Array.isArray(cachedStrings) &&
        cachedStrings.length > 0 &&
        (cachedSize == null || cachedSize === sourceSize)
      ) {
        return Promise.resolve(cachedStrings);
      }
    } catch {
      // rebuild below
    }
  }

  return loadSharedStrings(sourcePath).then((strings) => {
    if (strings.length === 0 && sourceSize > 1024) {
      throw new Error(
        "Could not parse sharedStrings.xml — ลบโฟลเดอร์ .prune-tmp แล้วรันใหม่",
      );
    }
    try {
      writeFileSync(
        cachePath,
        JSON.stringify({ sourceSize, strings }),
        "utf8",
      );
    } catch {
      // ignore cache write errors
    }
    return strings;
  });
}

export function readWorkbookSheets(workDir: string): SheetEntry[] {
  const workbookPath = path.join(workDir, "xl", "workbook.xml");
  const relsPath = path.join(workDir, "xl", "_rels", "workbook.xml.rels");
  if (!existsSync(workbookPath) || !existsSync(relsPath)) {
    return [
      {
        sheetIndex: 1,
        sheetName: "Sheet1",
        relId: "rId1",
        sheetPath: path.join(workDir, "xl", "worksheets", "sheet1.xml"),
        sheetXmlName: "sheet1.xml",
        zipEntry: "xl/worksheets/sheet1.xml",
      },
    ];
  }

  const workbook = readFileSync(workbookPath, "utf8");
  const rels = readFileSync(relsPath, "utf8");
  const relMap = new Map<string, string>();
  for (const m of rels.matchAll(
    /Id="([^"]+)"[^>]*Target="worksheets\/([^"]+)"/g,
  )) {
    relMap.set(m[1], m[2]);
  }

  const sheets: SheetEntry[] = [];
  let sheetIndex = 0;
  for (const m of workbook.matchAll(
    /<sheet[^>]*r:id="([^"]+)"[^>]*(?:name="([^"]*)")?/g,
  )) {
    sheetIndex++;
    const relId = m[1];
    const target = relMap.get(relId);
    const xmlName = target ?? `sheet${sheetIndex}.xml`;
    sheets.push({
      sheetIndex,
      sheetName: m[2] || `Sheet${sheetIndex}`,
      relId,
      sheetPath: path.join(workDir, "xl", "worksheets", xmlName),
      sheetXmlName: xmlName,
      zipEntry: `xl/worksheets/${xmlName}`,
    });
  }

  if (sheets.length === 0) {
    sheets.push({
      sheetIndex: 1,
      sheetName: "Sheet1",
      relId: "rId1",
      sheetPath: path.join(workDir, "xl", "worksheets", "sheet1.xml"),
      sheetXmlName: "sheet1.xml",
      zipEntry: "xl/worksheets/sheet1.xml",
    });
  }
  return sheets;
}

export function listWorkbookSheets(workDir: string): SheetEntry[] {
  execSync(`tar -xf book.zip xl/workbook.xml xl/_rels/workbook.xml.rels`, {
    cwd: workDir,
    stdio: "pipe",
    shell: TAR_SHELL,
  });
  return readWorkbookSheets(workDir);
}

export function partialExtractFromXlsx(
  xlsxPath: string,
  workDir: string,
  entries: string[],
) {
  if (entries.length === 0) return;
  runTar(
    ["-xf", path.resolve(xlsxPath), "-C", path.resolve(workDir), ...entries],
  );
}

function extractSheets(workDir: string, sheets: SheetEntry[]) {
  const args = [
    "xl/sharedStrings.xml",
    ...sheets.map((s) => `xl/worksheets/${s.sheetXmlName}`),
  ];
  execSync(`tar -xf book.zip ${args.join(" ")}`, {
    cwd: workDir,
    stdio: "pipe",
    shell: TAR_SHELL,
  });
}

/** List all paths inside an .xlsx zip archive. */
export function listXlsxZipEntries(xlsxPath: string): string[] {
  const result = spawnSync("tar", ["-tf", path.resolve(xlsxPath)], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(
      (result.stderr || result.stdout || "").trim() ||
        "Could not list .xlsx entries",
    );
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\\/g, "/"))
    .filter((line) => line.length > 0);
}

export function assertValidXlsxZip(xlsxPath: string): void {
  const fd = openSync(xlsxPath, "r");
  const magic = Buffer.alloc(4);
  readSync(fd, magic, 0, 4, 0);
  closeSync(fd);
  if (magic[0] !== 0x50 || magic[1] !== 0x4b) {
    throw new Error(
      "Output .xlsx is not a ZIP archive (Windows tar -a bug) — rebuild failed",
    );
  }

  const entries = listXlsxZipEntries(xlsxPath);
  const bad = entries.filter(
    (e) =>
      e.startsWith("./") ||
      e.includes("__prune") ||
      e.endsWith("/"),
  );
  if (bad.length > 0) {
    throw new Error(
      `Output .xlsx has invalid zip entries (e.g. ${bad[0]}) — rebuild failed`,
    );
  }
  if (!entries.includes("[Content_Types].xml")) {
    throw new Error("Output .xlsx is missing [Content_Types].xml");
  }
}

/** Build output .xlsx by packing metadata from source + filtered worksheets. */
export function rebuildXlsxFromWorkDir(
  xlsxPath: string,
  workDir: string,
  outputPath: string,
  keptSheets: SheetEntry[],
): void {
  const packDir = path.join(workDir, "_pack");
  if (existsSync(packDir)) {
    rmSync(packDir, { recursive: true, force: true });
  }

  extractFullXlsx(xlsxPath, packDir);

  const keptNames = new Set(keptSheets.map((s) => s.sheetXmlName));
  const wsDir = path.join(packDir, "xl", "worksheets");
  if (existsSync(wsDir)) {
    for (const name of readdirSync(wsDir)) {
      if (!keptNames.has(name)) {
        unlinkSync(path.join(wsDir, name));
      }
    }
  }

  for (const sheet of keptSheets) {
    copyFileSync(
      path.join(workDir, "xl", "worksheets", sheet.sheetXmlName),
      path.join(packDir, "xl", "worksheets", sheet.sheetXmlName),
    );
  }
  copyFileSync(
    path.join(workDir, "xl", "workbook.xml"),
    path.join(packDir, "xl", "workbook.xml"),
  );
  copyFileSync(
    path.join(workDir, "xl", "_rels", "workbook.xml.rels"),
    path.join(packDir, "xl", "_rels", "workbook.xml.rels"),
  );

  trimContentTypes(packDir, keptSheets);
  packWorkbookZip(packDir, outputPath);
  assertValidXlsxZip(outputPath);
  rmSync(packDir, { recursive: true, force: true });
}

/** Replace entries inside an existing .xlsx zip without full extraction. */
export function updateZipEntries(
  zipPath: string,
  workDir: string,
  entries: string[],
) {
  if (entries.length === 0) return;
  execSync(
    `tar -uf ${shellQuote(zipPath)} ${entries.map((e) => shellQuote(e)).join(" ")}`,
    {
      cwd: workDir,
      stdio: "pipe",
      shell: TAR_SHELL,
    },
  );
}

export function trimWorkbookToSheets(
  workDir: string,
  keptSheets: SheetEntry[],
): void {
  const workbookPath = path.join(workDir, "xl", "workbook.xml");
  const relsPath = path.join(workDir, "xl", "_rels/workbook.xml.rels");
  if (!existsSync(workbookPath) || !existsSync(relsPath)) return;

  const keptIds = new Set(keptSheets.map((s) => s.relId));
  const keptXml = new Set(keptSheets.map((s) => s.sheetXmlName));

  const workbook = readFileSync(workbookPath, "utf8");
  const trimmedWorkbook = workbook.replace(
    /<sheet\b[^>]*\/>|<sheet\b[^>]*>[\s\S]*?<\/sheet>/g,
    (tag) => {
      const idMatch = tag.match(/\br:id="([^"]+)"/);
      return idMatch && keptIds.has(idMatch[1]) ? tag : "";
    },
  );
  writeFileSync(workbookPath, trimmedWorkbook, "utf8");

  const rels = readFileSync(relsPath, "utf8");
  const trimmedRels = rels.replace(/<Relationship\b[^>]*\/>/g, (tag) => {
    const targetMatch = tag.match(/Target="worksheets\/([^"]+)"/);
    if (!targetMatch) return tag;
    return keptXml.has(targetMatch[1]) ? tag : "";
  });
  writeFileSync(relsPath, trimmedRels, "utf8");
}

function listPackFiles(dir: string, base = ""): string[] {
  const results: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "__prune_output__.xlsx") continue;
    const rel = base ? `${base}/${name}` : name;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      results.push(...listPackFiles(full, rel));
    } else {
      results.push(rel.replace(/\\/g, "/"));
    }
  }
  return results;
}

export function trimContentTypes(
  workDir: string,
  keptSheets: SheetEntry[],
): void {
  const ctPath = path.join(workDir, "[Content_Types].xml");
  if (!existsSync(ctPath)) return;

  const keptXml = new Set(keptSheets.map((s) => s.sheetXmlName));
  const content = readFileSync(ctPath, "utf8");
  const trimmed = content.replace(
    /<Override PartName="\/xl\/worksheets\/([^"]+)"[^>]*\/>/g,
    (tag, name: string) => (keptXml.has(name) ? tag : ""),
  );
  writeFileSync(ctPath, trimmed, "utf8");
}

export function packWorkbookZip(workDir: string, outputPath: string) {
  const tempName = "__prune_output__.xlsx";
  const tempOut = path.join(workDir, tempName);
  if (existsSync(tempOut)) unlinkSync(tempOut);

  const files = listPackFiles(workDir).sort((a, b) => {
    if (a === "[Content_Types].xml") return -1;
    if (b === "[Content_Types].xml") return 1;
    return a.localeCompare(b);
  });

  if (files.length === 0) {
    throw new Error("Nothing to pack into .xlsx");
  }

  // bsdtar on Windows ignores -a for .xlsx and writes ustar; Excel needs ZIP (PK).
  runTar(["--format", "zip", "-cf", tempName, ...files], workDir);

  copyFileSync(tempOut, outputPath);
  unlinkSync(tempOut);
}

export function prepareWorkbook(
  xlsxPath: string,
  target: UploadTargetType,
): {
  workDir: string;
  sharedPath: string;
  sheets: SheetEntry[];
} {
  const workDir = path.join(
    os.tmpdir(),
    `op-xlsx-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(workDir, { recursive: true });
  const zipPath = path.join(workDir, "book.zip");
  copyFileSync(xlsxPath, zipPath);

  const sheets = listWorkbookSheets(workDir);
  const selected = target === "DETAIL" ? sheets : sheets.slice(0, 1);

  extractSheets(workDir, selected);

  return {
    workDir,
    sharedPath: path.join(workDir, "xl", "sharedStrings.xml"),
    sheets: selected,
  };
}

/** Create temp workspace and list sheets — reads only small workbook metadata from zip. */
export async function preparePruneJob(
  xlsxPath: string,
  target: UploadTargetType,
  workDir?: string,
): Promise<{ workDir: string; sheets: SheetEntry[] }> {
  const resolvedWorkDir =
    workDir ??
    path.join(
      getPruneTempRoot(),
      `job-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
  mkdirSync(path.join(resolvedWorkDir, "xl", "worksheets"), { recursive: true });
  mkdirSync(path.join(resolvedWorkDir, "xl", "_rels"), { recursive: true });

  const workbook = await readXlsxEntryText(xlsxPath, "xl/workbook.xml");
  const rels = await readXlsxEntryText(xlsxPath, "xl/_rels/workbook.xml.rels");
  writeFileSync(path.join(resolvedWorkDir, "xl", "workbook.xml"), workbook, "utf8");
  writeFileSync(
    path.join(resolvedWorkDir, "xl", "_rels", "workbook.xml.rels"),
    rels,
    "utf8",
  );

  const allSheets = readWorkbookSheets(resolvedWorkDir);
  const selected =
    target === "DETAIL" ? allSheets.slice(0, 2) : allSheets.slice(0, 1);

  return { workDir: resolvedWorkDir, sheets: selected };
}

export function normalizeHeaderName(value: string): string {
  return value.replace(/\uFEFF/g, "").trim();
}

export function findHeaderColumnIndex(
  headerValues: (string | null)[],
  columnName: string,
): number | null {
  const target = columnName.trim().toUpperCase();
  for (let i = 0; i < headerValues.length; i++) {
    const cell = headerValues[i];
    if (cell == null || cell === "") continue;
    if (normalizeHeaderName(cell).toUpperCase() === target) {
      return i;
    }
  }
  return null;
}

export function rowMatchesFilter(
  values: (string | null)[],
  prov1Idx: number | null,
  prov2Idx: number | null,
  filterProv1: string,
  filterProv2: string,
): boolean {
  if (prov1Idx == null || prov2Idx == null) return false;
  const prov1 = (values[prov1Idx] ?? "").trim();
  const prov2 = (values[prov2Idx] ?? "").trim();
  return prov1 === filterProv1.trim() && prov2 === filterProv2.trim();
}

export function rowHasData(values: (string | null)[]): boolean {
  return values.some((v) => v != null && v !== "");
}

export function formatEnospcHint(): string {
  return (
    "Disk full during prune. Free space on C: or set PRUNE_TMP_DIR to a folder " +
    "on a drive with more space (e.g. set PRUNE_TMP_DIR=D:\\op-prune-tmp). " +
    "The output file also needs ~1x the source file size in OP_Data\\Pruned\\."
  );
}

export function isEnospcError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string };
  return (
    err.code === "ENOSPC" ||
    (typeof err.message === "string" &&
      err.message.includes("No space left on device"))
  );
}
