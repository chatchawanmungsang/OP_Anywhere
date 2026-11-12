import path from "path";
import readline from "readline";
import { existsSync } from "fs";
import { pruneXlsxFile, getPruneOutputPath } from "../src/lib/prune-xlsx";
import { jobWorkDir, clearJobWorkDir } from "../src/lib/prune-checkpoint";
import { countProv1SummaryForFile } from "../src/lib/prov-count";
import { getPruneTempRoot } from "../src/lib/xlsx-stream-core";
import { PruneProgressReporter } from "../src/lib/prune-progress";
import { colorStatusTag, matrixBanner, mx } from "../src/lib/terminal-theme";
import {
  findFirstPendingItem,
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
const FILTER_SUB_FUND = process.env.PRUNE_SUB_FUND_CONTAINS ?? "WALKIN";
const FILTER_SUMS_COST = Number.parseFloat(
  process.env.PRUNE_SUMS_COST ?? "0",
);
const MAX_RUNTIME_MS = Number.parseInt(
  process.env.PRUNE_MAX_MS ?? String(60 * 60 * 1000),
  10,
);
const AUTO_CONTINUE_SEC = 30;

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

function formatJobTimestamp(date: Date): string {
  return date.toLocaleString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatJobDuration(start: Date, end: Date): string {
  const sec = Math.max(0, (end.getTime() - start.getTime()) / 1000);
  if (sec < 60) return `${sec.toFixed(1)} วินาที`;
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return `${min} นาที ${rem} วินาที`;
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
      mx.dim(" — เลือกไฟล์ที่จะ Prune "),
  );
  console.log(
    mx.dim(
      `  • SUM:    PROV1=${FILTER_PROV1}, PROV2=${FILTER_PROV2}, SUB_FUND∋${FILTER_SUB_FUND}, SUMS_COST=${FILTER_SUMS_COST}`,
    ),
  );
  console.log(
    mx.dim(
      "  • DETAIL: เก็บเฉพาะแถวที่ TRAN_ID ตรงกับไฟล์ SUM ในเดือนและงวดเดียวกัน",
    ),
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
  console.log(`  ${mx.dim("Enter")} ${mx.dim("= เริ่มไฟล์แรกที่ยังไม่เสร็จอัตโนมัติ")}`);
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

/** Wait up to `seconds`; Enter starts immediately, q cancels auto-continue. */
async function waitAutoContinue(seconds: number): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createPrompt();
    let settled = false;

    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      rl.close();
      console.log("");
      resolve(value);
    };

    rl.question(
      mx.dim(
        `\nทำไฟล์ถัดไปอัตโนมัติใน ${seconds} วินาที — Enter=เริ่มเลย · q=หยุด: `,
      ),
      (answer) => {
        finish(answer.toLowerCase() !== "q");
      },
    );

    const timeout = setTimeout(() => finish(true), seconds * 1000);
  });
}

type ProcessFileResult = "done" | "paused" | "cancelled";

function shouldRunProv1Summary(item: FileListItem, resume: boolean): boolean {
  return !resume && item.target === "SUMMARY";
}

async function runProv1Summary(
  item: FileListItem,
  jobWorkDirPath: string,
): Promise<void> {
  console.log(mx.dim("  กำลังนับ PROV1 ..."));
  const report = await countProv1SummaryForFile(
    item.filePath,
    item.target,
    OUTPUT_DIR,
    {
      workDir: jobWorkDirPath,
      onProgress: (p) => {
        if (p.rowsScanned > 0 && p.rowsScanned % 100_000 === 0) {
          process.stdout.write(
            `\r${mx.dim(`  ${p.phase} · ${p.rowsScanned.toLocaleString()} แถว`)}`,
          );
        }
      },
    },
  );
  if (process.stdout.isTTY) {
    process.stdout.write("\r\x1b[K");
  }
  console.log("");
  console.log(mx.bold("สรุปจำนวนรายการตาม PROV1 (ก่อนกรอง):"));
  for (const line of report.reportText.split("\n")) {
    console.log(mx.dim(`  ${line}`));
  }
  console.log(`${mx.dim("บันทึก:")} ${mx.green(report.reportPath)}`);
  console.log("");
}

async function processFile(
  item: FileListItem,
  options?: { auto?: boolean },
): Promise<ProcessFileResult> {
  const auto = options?.auto ?? false;
  const outputPath = getPruneOutputPath(item.filePath, OUTPUT_DIR);

  let resume = item.status === "RESUME";

  if (item.status === "RESUME") {
    if (auto) {
      resume = true;
      console.log(
        `${mx.accent("ทำต่ออัตโนมัติ:")} ${mx.text(item.fileName)}`,
      );
    } else {
      const choice = await confirmResumeOrRestart(item);
      if (choice === null) {
        console.log(mx.dim("ยกเลิก"));
        return "cancelled";
      }
      resume = choice;
    }
  } else if (existsSync(outputPath)) {
    if (auto) {
      console.log(
        mx.dim(`  overwrite ${path.basename(outputPath)} (โหมดอัตโนมัติ)`),
      );
    } else {
      const ok = await confirmOverwrite(outputPath);
      if (!ok) {
        console.log(mx.dim("ยกเลิก — ไม่ได้เขียนทับไฟล์"));
        return "cancelled";
      }
    }
  }

  console.log("");
  console.log(
    resume
      ? `${mx.accent("ทำต่อ Prune:")} ${mx.text(item.fileName)} ...`
      : `${mx.bright("กำลัง Prune:")} ${mx.text(item.fileName)} ...`,
  );

  const jobWorkDirPath = jobWorkDir(item.fileName);

  if (shouldRunProv1Summary(item, resume)) {
    clearJobWorkDir(jobWorkDirPath);
    try {
      await runProv1Summary(item, jobWorkDirPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`นับ PROV1 ไม่สำเร็จ: ${message}`);
    }
  }

  const jobStartedAt = new Date();
  console.log(`${mx.dim("เริ่ม:")} ${mx.text(formatJobTimestamp(jobStartedAt))}`);
  console.log(mx.dim("  (กำลังทำงาน — อย่าปิดหน้าต่างนี้)"));
  console.log("");

  const progress = new PruneProgressReporter();
  progress.start({
    phase: resume ? "ทำต่อ" : "เริ่มต้น",
    sheetIndex: 1,
    sheetCount: item.target === "DETAIL" ? 2 : 1,
  });

  try {
    const result = await pruneXlsxFile(item.filePath, item.target, {
      filterProv1: FILTER_PROV1,
      filterProv2: FILTER_PROV2,
      filterSubFundContains: FILTER_SUB_FUND,
      filterSumsCostEquals: FILTER_SUMS_COST,
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

    const jobFinishedAt = new Date();
    const durationLabel = formatJobDuration(jobStartedAt, jobFinishedAt);

    if (result.paused) {
      progress.stop();
      console.log("");
      console.log(mx.warn("หยุดชั่วคราว (เกินเวลาที่กำหนดหรือขัดจังหวะ):"));
      console.log(`  ${mx.dim("เริ่ม:")} ${mx.text(formatJobTimestamp(jobStartedAt))}`);
      console.log(`  ${mx.dim("หยุด:")} ${mx.text(formatJobTimestamp(jobFinishedAt))}`);
      console.log(`  ${mx.dim("ใช้เวลา:")} ${mx.bright(durationLabel)}`);
      console.log(`  ${mx.dim("Rows kept สะสม:")} ${mx.text(result.rowsKept.toLocaleString())}`);
      console.log(`  ${mx.dim("Rows skipped สะสม:")} ${mx.dim(result.rowsSkipped.toLocaleString())}`);
      console.log("");
      console.log(mx.green("  → รัน npm run prune แล้วเลือกไฟล์เดิม (สถานะ [RESUME]) เพื่อทำต่อ"));
      return "paused";
    }

    progress.stop(
      `  ✓ เสร็จแล้ว — kept=${result.rowsKept.toLocaleString()} skip=${result.rowsSkipped.toLocaleString()} (${durationLabel})`,
    );
    console.log("");
    console.log(mx.bold("เสร็จแล้ว:"));
    console.log(`  ${mx.dim("เริ่ม:")} ${mx.text(formatJobTimestamp(jobStartedAt))}`);
    console.log(`  ${mx.dim("เสร็จ:")} ${mx.text(formatJobTimestamp(jobFinishedAt))}`);
    console.log(`  ${mx.dim("ใช้เวลา:")} ${mx.bright(durationLabel)}`);
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
    return "done";
  } catch (error) {
    progress.stop();
    throw error;
  }
}

function listCurrentItems(): FileListItem[] {
  const state = loadPruneState(DATA_DIR);
  return listPruneCandidates(
    DATA_DIR,
    OUTPUT_DIR,
    state,
    FILTER_PROV1,
    FILTER_PROV2,
    FILTER_SUB_FUND,
    FILTER_SUMS_COST,
  );
}

function resolveFreshItem(item: FileListItem): FileListItem {
  return (
    listCurrentItems().find((entry) => entry.fileName === item.fileName) ?? item
  );
}

async function continuePendingChain(fromItem?: FileListItem): Promise<void> {
  let next = fromItem
    ? resolveFreshItem(fromItem)
    : findFirstPendingItem(listCurrentItems());
  while (next) {
    try {
      const fresh = resolveFreshItem(next);
      const outcome = await processFile(fresh, { auto: true });
      if (outcome !== "done") return;

      const pending = findFirstPendingItem(listCurrentItems());
      if (!pending) {
        console.log("");
        console.log(mx.green("✓ ทำครบทุกไฟล์แล้ว"));
        return;
      }

      console.log("");
      console.log(
        `${mx.dim("ถัดไป:")} ${mx.text(pending.fileName)} ${colorStatusTag(statusLabel(pending))}`,
      );

      const shouldContinue = await waitAutoContinue(AUTO_CONTINUE_SEC);
      if (!shouldContinue) {
        console.log(mx.dim("หยุดทำต่ออัตโนมัติ"));
        return;
      }

      next = pending;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("");
      console.error(mx.error(`ผิดพลาด: ${message}`));
      return;
    }
  }
}

async function mainLoop() {
  while (true) {
    const items = listCurrentItems();

    printHeader();
    printFileList(items);

    if (items.length === 0) {
      const answer = await ask(mx.dim("กด Enter เพื่อสแกนใหม่ หรือ q เพื่อออก: "));
      if (answer.toLowerCase() === "q") break;
      continue;
    }

    const answer = await ask(mx.green("เลือกหมายเลข (Enter=อัตโนมัติ): "));
    if (answer.toLowerCase() === "q") break;

    if (answer === "") {
      const firstPending = findFirstPendingItem(items);
      if (!firstPending) {
        console.log(mx.dim("ไม่มีไฟล์ที่รอทำ — ทำครบแล้ว"));
        continue;
      }
      console.log(
        `${mx.accent("เลือกอัตโนมัติ:")} ${mx.text(firstPending.fileName)}`,
      );
      await continuePendingChain(firstPending);
      continue;
    }

    const index = Number.parseInt(answer, 10);
    if (!Number.isFinite(index) || index < 1 || index > items.length) {
      console.log(mx.warn("หมายเลขไม่ถูกต้อง — ลองใหม่"));
      continue;
    }

    const selected = items[index - 1];
    try {
      const outcome = await processFile(selected);
      if (outcome === "done") {
        const pending = findFirstPendingItem(listCurrentItems());
        if (pending) {
          console.log("");
          console.log(
            `${mx.dim("ถัดไป:")} ${mx.text(pending.fileName)} ${colorStatusTag(statusLabel(pending))}`,
          );
          const shouldContinue = await waitAutoContinue(AUTO_CONTINUE_SEC);
          if (shouldContinue) {
            await continuePendingChain(pending);
          } else {
            console.log(mx.dim("หยุดทำต่ออัตโนมัติ"));
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("");
      console.error(mx.error(`ผิดพลาด: ${message}`));
    }
  }

  console.log("");
  console.log(mx.dim("ออกจากโปรแกรมแล้ว"));
}

mainLoop().catch((error) => {
  console.error(mx.error("[prune-cli] Fatal:"), error);
  process.exit(1);
});
