const RESET = "\x1b[0m";
const BRIGHT_GREEN = "\x1b[92m";
const GREEN = "\x1b[32m";
const DIM_GREEN = "\x1b[38;5;28m";
const MATRIX = "\x1b[38;2;0;255;65m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[93m";
const RED = "\x1b[91m";
const BOLD = "\x1b[1m";

function useColor(): boolean {
  if (process.env.NO_COLOR === "1" || process.env.PRUNE_NO_COLOR === "1") {
    return false;
  }
  return Boolean(process.stdout.isTTY);
}

function wrap(code: string, text: string): string {
  if (!useColor()) return text;
  return `${code}${text}${RESET}`;
}

/** Matrix-style terminal palette for prune CLI. */
export const mx = {
  /** Primary text — neon green */
  text: (s: string) => wrap(MATRIX, s),
  /** Headers / emphasis */
  bright: (s: string) => wrap(BRIGHT_GREEN, s),
  /** Labels, paths, secondary */
  dim: (s: string) => wrap(DIM_GREEN, s),
  /** Standard green */
  green: (s: string) => wrap(GREEN, s),
  /** Phase / type tags */
  accent: (s: string) => wrap(CYAN, s),
  warn: (s: string) => wrap(YELLOW, s),
  error: (s: string) => wrap(RED, s),
  bold: (s: string) => wrap(BOLD + BRIGHT_GREEN, s),
  barFill: (s: string) => wrap(MATRIX, s),
  barEmpty: (s: string) => wrap(DIM_GREEN, s),
  spinner: (s: string) => wrap(BRIGHT_GREEN, s),
  cursor: (s: string) => wrap(MATRIX, s),
  tagNew: (s: string) => wrap(BRIGHT_GREEN, s),
  tagDone: (s: string) => wrap(DIM_GREEN, s),
  tagResume: (s: string) => wrap(CYAN, s),
  ok: (s: string) => wrap(BRIGHT_GREEN, s),
};

export function colorStatusTag(tag: string): string {
  if (tag.startsWith("[NEW]")) return mx.tagNew(tag);
  if (tag.startsWith("[DONE]")) return mx.tagDone(tag);
  if (tag.startsWith("[RESUME")) return mx.tagResume(tag);
  return mx.dim(tag);
}

export function matrixBanner(): string {
  const line = "════════════════════════════════════════";
  return `${mx.dim(line)}\n${mx.bold(" OP PRUNE ")} ${mx.dim("·")} ${mx.text("PROV1/PROV2 filter")}\n${mx.dim(line)}`;
}
