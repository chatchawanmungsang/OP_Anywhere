import { spawn, type ChildProcess } from "child_process";
import { Readable } from "stream";

const STREAM_IDLE_MS = 3 * 60 * 1000;

export type XlsxEntryStream = Readable & {
  kill: () => void;
};

export function openXlsxEntryStream(
  xlsxPath: string,
  entry: string,
): XlsxEntryStream {
  const normalized = entry.replace(/\\/g, "/");
  const child: ChildProcess = spawn(
    "tar",
    ["-xOf", xlsxPath, normalized],
    {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );

  const stdout = child.stdout;
  if (!stdout) {
    throw new Error("Failed to open Excel stream.");
  }
  const stream = stdout as XlsxEntryStream;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let stderrText = "";

  const clearIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  };

  const armIdle = () => {
    clearIdle();
    idleTimer = setTimeout(() => {
      child.kill();
      stream.destroy(
        new Error(
          "อ่าน Excel ค้างเกิน 3 นาที — กด Ctrl+C แล้วเลือก [RESUME] เพื่อทำต่อ",
        ),
      );
    }, STREAM_IDLE_MS);
  };

  child.stderr?.on("data", (chunk: Buffer | string) => {
    stderrText += chunk.toString();
  });

  child.on("error", (error) => {
    clearIdle();
    stream.destroy(error);
  });

  child.on("close", (code) => {
    clearIdle();
    if (code !== 0 && !stream.destroyed) {
      stream.destroy(
        new Error(stderrText.trim() || `tar exited with code ${code}`),
      );
    }
  });

  stream.on("data", () => armIdle());
  stream.on("end", () => clearIdle());
  stream.on("close", () => clearIdle());

  stream.kill = () => {
    clearIdle();
    child.kill();
  };

  armIdle();
  return stream;
}

export async function readXlsxEntryText(
  xlsxPath: string,
  entry: string,
): Promise<string> {
  const stream = openXlsxEntryStream(xlsxPath, entry);
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    stream.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

export async function xlsxEntryExists(
  xlsxPath: string,
  entry: string,
): Promise<boolean> {
  try {
    await readXlsxEntryText(xlsxPath, entry);
    return true;
  } catch {
    return false;
  }
}
