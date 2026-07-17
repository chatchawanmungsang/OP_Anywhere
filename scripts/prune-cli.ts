import path from "path";
import readline from "readline";
import { existsSync } from "fs";
import { pruneXlsxFile, getPruneOutputPath } from "../src/lib/prune-xlsx";
import { getPruneTempRoot } from "../src/lib/xlsx-stream-core";
import { PruneProgressReporter } from "../src/lib/prune-progress";
import { colorStatusTag, matrixBanner, mx } from "../src/lib/terminal-theme";
import {
  listPruneCandidates,
  loadPruneState,
  savePruneState,
  upsertPruneStateEntry,
  type FileListItem,
} from "../src/lib/prune-state";

const DATA_DIR = path.resolve(process.env.OP_DATA_DIR ?? "./OP_Data");
const OUTPUT_DIR = path.join(DATA_DIR, "Pruned");
const FILTER_PROV1 = process.env.PRUNE_PROV1 ?? "4000";
const FILTER_PROV2 = process.env.PRUNE_PROV2 ?? "4000";
const MAX_RUNTIME_MS = Number.parseInt(
  process.env.PRUNE_MAX_MS ?? String(60 * 60 * 1000),
  10,
);

if (!process.env.PRUNE_TMP_DIR) {
  process.env.PRUNE_TMP_DIR = path.join(DATA_DIR, ".prune-tmp");
}

function createPrompt() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(prompt: string): Promise<string> {
  const rl = createPrompt();
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(item: FileListItem): string {
  if (item.status === "RESUME") {
    const done = item.checkpointSheetsDone ?? 0;
    return `[RESUME ทำต่อได้ · ชีตเสร็จ ${done}]`;
  }
  if (item.status === "DONE") return "[DONE]";
  return "[NEW]";
}

function printHeader() {
  console.log("");
  console.log(matrixBanner());
  console.log(
    mx.text("OP_Data") +
      mx.dim(" — เลือกไฟล์ที่จะ Prune ") +
      mx.dim(`(PROV1=${FILTER_PROV1}, PROV2=${FILTER_PROV2})`),
  );
  console.log(`${mx.dim("Source:")} ${mx.green(DATA_DIR)}`);
  console.log(`${mx.dim("Output:")} ${mx.green(OUTPUT_DIR)}`);
  console.log(
    `${mx.dim("Temp:")}   ${mx.green(getPruneTempRoot())} ${mx.dim("(แตก source ครั้งเดียว/ไฟล์)")}`,
  );
  console.log(
    `${mx.dim("Limit:")}  ${mx.bright(String(Math.round(MAX_RUNTIME_MS / 60_000)))} ${mx.dim("นาที/ครั้ง · PRUNE_NO_COLOR=1 ปิดสี")}`,
  );
  console.log("");
}

function printFileList(items: FileListItem[]) {
  if (items.length === 0) {
    console.log(mx.warn("ไม่พบไฟล์ SUM/DETAIL .xlsx ใน OP_Data"));
    console.log(mx.dim("วางไฟล์ เช่น PROV1_PROV2_RG07_SUM_6809_01.xlsx แล้วรันใหม่"));
    return;
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const tag = colorStatusTag(statusLabel(item));
    const type = item.target === "SUMMARY" ? "SUM" : "DETAIL";
    console.log(
      `  ${mx.bright(String(i + 1))}. ${tag} ${mx.text(item.fileName)} ${mx.dim(`(${type}, ${formatBytes(item.size)})`)}`,
    );
  }
  console.log("");
  console.log(`  ${mx.dim("q.")} ${mx.dim("ออก")}`);
  console.log("");
}

async function confirmOverwrite(outputPath: string): Promise<boolean> {
  const answer = await ask(
    mx.warn(`ไฟล์ ${path.basename(outputPath)} มีอยู่แล้ว — overwrite? (y/N): `),
  );
  return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
}

async function confirmResumeOrRestart(item: FileListItem): Promise<boolean | null> {
  console.log("");
  console.log(`${mx.accent("พบงานค้างของ")} ${mx.text(item.fileName)}`);
  const cs = item.checkpoint?.currentSheet;
  if (
    cs &&
    !cs.complete &&
    cs.lastRowNum == null &&
    cs.rowsScanned > (cs.estimatedMaxRow ?? 0) * 1.1
  ) {
    console.log(mx.warn("  ⚠ checkpoint เก่าเสีย — แนะนำ เริ่มใหม่ (r) เพื่อไม่ให้ค้าง"));
  }
  const answer = await ask(
    mx.green("ทำต่อ (Enter/c) หรือ เริ่มใหม่ (r) หรือ ยกเลิก (n)? [c/r/n]: "),
  );
  const lower = answer.toLowerCase();
  if (lower === "n" || lower === "no") return null;
  if (lower === "r" || lower === "restart") return false;
  return true;
}

async function processFile(item: FileListItem): Promise<void> {
  const outputPath = getPruneOutputPath(item.filePath, OUTPUT_DIR);

  let resume = item.status === "RESUME";

  if (item.status === "RESUME") {
    const choice = await confirmResumeOrRestart(item);
    if (choice === null) {
      console.log(mx.dim("ยกเลิก"));
      return;
    }
    resume = choice;
  } else if (existsSync(outputPath)) {
    const ok = await confirmOverwrite(outputPath);
    if (!ok) {
      console.log(mx.dim("ยกเลิก — ไม่ได้เขียนทับไฟล์"));
      return;
    }
  }

  console.log("");
  console.log(
    resume
      ? `${mx.accent("ทำต่อ Prune:")} ${mx.text(item.fileName)} ...`
      : `${mx.bright("กำลัง Prune:")} ${mx.text(item.fileName)} ...`,
  );
  console.log(mx.dim("  (กำลังทำงาน — อย่าปิดหน้าต่างนี้)"));
  console.log("");

  const progress = new PruneProgressReporter();
  progress.start({
    phase: resume ? "ทำต่อ" : "เริ่มต้น",
    sheetIndex: 1,
    sheetCount: item.target === "DETAIL" ? 2 : 1,
  });

  const startedAt = Date.now();

  try {
    const result = await pruneXlsxFile(item.filePath, item.target, {
    filterProv1: FILTER_PROV1,
    filterProv2: FILTER_PROV2,
    outputDir: OUTPUT_DIR,
    resume,
    maxRuntimeMs: MAX_RUNTIME_MS,
    onProgress: (event) => {
      progress.update({
        phase: event.phase,
        sheetIndex: event.sheetIndex,
        sheetCount: event.sheetCount,
        rowsKept: event.rowsKept,
        rowsSkipped: event.rowsSkipped,
        rowsScanned: event.rowsScanned,
        sheetEstimatedMaxRow: event.sheetEstimatedMaxRow,
      });
    },
  });

    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

    if (result.paused) {
      progress.stop();
      console.log("");
      console.log(mx.warn("หยุดชั่วคราว (เกินเวลาที่กำหนดหรือขัดจังหวะ):"));
      console.log(`  ${mx.dim("Rows kept สะสม:")} ${mx.text(result.rowsKept.toLocaleString())}`);
      console.log(`  ${mx.dim("Rows skipped สะสม:")} ${mx.dim(result.rowsSkipped.toLocaleString())}`);
      console.log(`  ${mx.dim("Time:")} ${mx.bright(elapsedSec + "s")}`);
      console.log("");
      console.log(mx.green("  → รัน npm run prune แล้วเลือกไฟล์เดิม (สถานะ [RESUME]) เพื่อทำต่อ"));
      return;
    }

    progress.stop(
      `  ✓ เสร็จแล้วใน ${elapsedSec}s — kept=${result.rowsKept.toLocaleString()} skip=${result.rowsSkipped.toLocaleString()}`,
    );
    console.log("");
    console.log(mx.bold("เสร็จแล้ว:"));
    console.log(`  ${mx.dim("Output:")} ${mx.green(result.outputPath)}`);
    console.log(`  ${mx.dim("Rows kept:")} ${mx.text(result.rowsKept.toLocaleString())}`);
    console.log(`  ${mx.dim("Rows skipped:")} ${mx.dim(result.rowsSkipped.toLocaleString())}`);
    console.log(`  ${mx.dim("Sheets:")} ${mx.bright(String(result.sheetsProcessed))}`);

    const state = loadPruneState(DATA_DIR);
    const updated = upsertPruneStateEntry(state, {
      fileName: item.fileName,
      size: item.size,
      mtimeMs: item.mtimeMs,
      prunedAt: new Date().toISOString(),
      outputPath: result.outputPath,
      rowsKept: result.rowsKept,
      rowsSkipped: result.rowsSkipped,
    });
    savePruneState(DATA_DIR, updated);
  } catch (error) {
    progress.stop();
    throw error;
  }
}

async function mainLoop() {
  while (true) {
    const state = loadPruneState(DATA_DIR);
    const items = listPruneCandidates(
      DATA_DIR,
      OUTPUT_DIR,
      state,
      FILTER_PROV1,
      FILTER_PROV2,
    );

    printHeader();
    printFileList(items);

    if (items.length === 0) {
      const answer = await ask(mx.dim("กด Enter เพื่อสแกนใหม่ หรือ q เพื่อออก: "));
      if (answer.toLowerCase() === "q") break;
      continue;
    }

    const answer = await ask(mx.green("เลือกหมายเลข: "));
    if (answer.toLowerCase() === "q") break;

    const index = Number.parseInt(answer, 10);
    if (!Number.isFinite(index) || index < 1 || index > items.length) {
      console.log(mx.warn("หมายเลขไม่ถูกต้อง — ลองใหม่"));
      continue;
    }

    const selected = items[index - 1];
    try {
      await processFile(selected);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("");
      console.error(mx.error(`ผิดพลาด: ${message}`));
    }

    console.log("");
    await ask(mx.dim("กด Enter เพื่อกลับไปเลือกไฟล์ถัดไป..."));
  }

  console.log("");
  console.log(mx.dim("ออกจากโปรแกรมแล้ว"));
}

mainLoop().catch((error) => {
  console.error(mx.error("[prune-cli] Fatal:"), error);
  process.exit(1);
});
