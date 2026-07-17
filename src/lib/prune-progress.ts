import readline from "readline";
import { mx } from "./terminal-theme";

export type ProgressSnapshot = {
  phase: string;
  sheetIndex: number;
  sheetCount: number;
  rowsKept: number;
  rowsSkipped: number;
  rowsScanned: number;
  estimatedMaxRow: number | null;
  sheetEstimatedMaxRow: number | null;
};

const SPINNER = ["-", "\\", "|", "/"] as const;
const STALL_WARN_MS = 2 * 60 * 1000;

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  }
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function formatRowCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return n.toLocaleString();
}

function renderBar(ratio: number, width = 24): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(clamped * width);
  const empty = width - filled;
  return mx.barFill("█".repeat(filled)) + mx.barEmpty("░".repeat(empty));
}

function rowProgressLabel(snapshot: ProgressSnapshot): string {
  const scanned = formatRowCount(snapshot.rowsScanned);
  const est = snapshot.sheetEstimatedMaxRow;
  if (est && est > 0) {
    if (snapshot.rowsScanned > est) {
      return `แถว ${mx.bright(scanned)}/${mx.dim(formatRowCount(est) + "+")}`;
    }
    return `แถว ${mx.bright(scanned)}/${mx.dim(formatRowCount(est))}`;
  }
  return `แถว ${mx.bright(scanned)}+`;
}

/** Percent is indicative only — Excel dimension often under-counts actual rows. */
function overallPercent(snapshot: ProgressSnapshot): number | null {
  const est = snapshot.sheetEstimatedMaxRow;
  if (!est || est <= 0) return null;

  if (snapshot.rowsScanned > est) {
    return null;
  }

  const sheetPct = (snapshot.rowsScanned / est) * 100;
  const perSheet = 100 / snapshot.sheetCount;
  return (snapshot.sheetIndex - 1) * perSheet + (sheetPct / 100) * perSheet;
}

function terminalWidth(): number {
  return process.stdout.columns && process.stdout.columns > 0
    ? process.stdout.columns
    : 100;
}

/** Strip ANSI for width calculation. */
function visibleLength(text: string): number {
  return text.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function buildStatusLine(
  snapshot: ProgressSnapshot,
  spin: string,
  pct: number | null,
  bar: string,
  cursor: string,
  elapsed: string,
  stalled: boolean,
  width: number,
): string {
  const rowLabel = rowProgressLabel(snapshot);
  const pctLabel = pct == null ? mx.dim("…") : mx.bright(`${pct.toFixed(1)}%`);
  const stallLabel = stalled ? mx.warn(" | ค้าง?") : "";

  const compact =
    ` ${mx.spinner(spin)} ${pctLabel}` +
    ` | ${rowLabel}` +
    ` | ${mx.dim("k=")}${mx.text(formatRowCount(snapshot.rowsKept))}` +
    ` ${mx.dim("s=")}${mx.dim(formatRowCount(snapshot.rowsSkipped))}` +
    stallLabel +
    ` | ${mx.dim(elapsed)}${mx.cursor(cursor)}`;

  const full =
    ` ${mx.spinner(spin)} [${bar}] ${pctLabel}` +
    ` | ${mx.accent(snapshot.phase)}` +
    ` | ${rowLabel}` +
    ` | ${mx.dim("kept=")}${mx.text(snapshot.rowsKept.toLocaleString())}` +
    ` ${mx.dim("skip=")}${mx.dim(snapshot.rowsSkipped.toLocaleString())}` +
    stallLabel +
    ` | ${mx.dim(elapsed)}${mx.cursor(cursor)}`;

  const text = width >= 88 ? full : compact;
  if (visibleLength(text) >= width) {
    let len = 0;
    let cut = text.length;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "\x1b") {
        const end = text.indexOf("m", i);
        if (end !== -1) {
          i = end;
          continue;
        }
      }
      len++;
      if (len >= width - 1) {
        cut = i + 1;
        break;
      }
    }
    return text.slice(0, cut);
  }
  return text;
}

export class PruneProgressReporter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private frame = 0;
  private blinkOn = true;
  private startedAt = Date.now();
  private lastRowsScannedAt = Date.now();
  private lastRowsScanned = 0;
  private lastWrittenWidth = 0;
  private onResizeHandler: (() => void) | null = null;
  private snapshot: ProgressSnapshot = {
    phase: "เริ่มต้น",
    sheetIndex: 1,
    sheetCount: 1,
    rowsKept: 0,
    rowsSkipped: 0,
    rowsScanned: 0,
    estimatedMaxRow: null,
    sheetEstimatedMaxRow: null,
  };

  start(initial: Partial<ProgressSnapshot> = {}): void {
    this.startedAt = Date.now();
    this.lastRowsScannedAt = Date.now();
    this.snapshot = { ...this.snapshot, ...initial };
    this.lastRowsScanned = this.snapshot.rowsScanned;
    this.lastWrittenWidth = 0;

    if (!this.onResizeHandler) {
      this.onResizeHandler = () => {
        if (!this.timer) return;
        process.stdout.write("\n");
        this.lastWrittenWidth = 0;
        this.render();
      };
      process.stdout.on("resize", this.onResizeHandler);
    }

    if (this.timer) return;
    this.timer = setInterval(() => this.render(), 400);
    this.render();
  }

  update(partial: Partial<ProgressSnapshot>): void {
    if (
      partial.rowsScanned != null &&
      partial.rowsScanned !== this.snapshot.rowsScanned
    ) {
      this.lastRowsScannedAt = Date.now();
      this.lastRowsScanned = partial.rowsScanned;
    }
    this.snapshot = { ...this.snapshot, ...partial };
  }

  stop(finalMessage?: string): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.onResizeHandler) {
      process.stdout.off("resize", this.onResizeHandler);
      this.onResizeHandler = null;
    }
    this.clearCurrentLine();
    if (finalMessage) {
      console.log(mx.ok(finalMessage));
    }
  }

  private clearCurrentLine(): void {
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
  }

  private render(): void {
    if (!process.stdout.isTTY) {
      return;
    }

    this.frame = (this.frame + 1) % SPINNER.length;
    this.blinkOn = !this.blinkOn;
    const pct = overallPercent(this.snapshot);
    const width = terminalWidth();
    const barWidth = width >= 100 ? 24 : width >= 80 ? 16 : 8;

    const bar =
      pct == null
        ? renderBar((Date.now() % 1600) / 1600, barWidth)
        : renderBar(pct / 100, barWidth);

    const spin = SPINNER[this.frame];
    const cursor = this.blinkOn ? "_" : " ";
    const elapsed = formatDuration(Date.now() - this.startedAt);
    const stalled =
      Date.now() - this.lastRowsScannedAt > STALL_WARN_MS &&
      this.snapshot.phase.includes("กรอง") &&
      !this.snapshot.phase.includes("ข้าม") &&
      !this.snapshot.phase.includes("ปิด") &&
      !this.snapshot.phase.includes("รวม");

    let line = buildStatusLine(
      this.snapshot,
      spin,
      pct,
      bar,
      cursor,
      elapsed,
      stalled,
      width,
    );

    const visLen = visibleLength(line);
    const padTo = Math.max(visLen, this.lastWrittenWidth);
    if (padTo > visLen && padTo < width) {
      line = line + " ".repeat(padTo - visLen);
    }

    this.clearCurrentLine();
    process.stdout.write(line);
    this.lastWrittenWidth = padTo;
  }
}
