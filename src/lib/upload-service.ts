import "server-only";

import { prisma } from "@/lib/prisma";
import {
  detectUploadTarget,
  isXlsxFile,
  MAX_UPLOAD_BYTES,
} from "@/lib/eclaim-upload";
import {
  archiveRelativePath,
  computeNextScheduleAt,
  formatThaiPeriod,
  validateUploadMetadata,
} from "@/lib/import-metadata";
import { UploadStatus, UploadTarget } from "@prisma/client";
import { createWriteStream, mkdirSync } from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

export type ImportScheduleMode = "SCHEDULED" | "IMMEDIATE";

export type StageUploadInput = {
  file: File;
  userId: string;
  dataYearThai: number;
  dataMonthThai: number;
  dataPeriod: number;
  filterProv1: string;
  filterProv2: string;
  scheduleMode?: ImportScheduleMode;
};

export type StageUploadResult = {
  ok: boolean;
  message: string;
  batchId?: string;
  scheduledAt?: string;
  scheduleMode?: ImportScheduleMode;
};

export function getArchiveRoot(): string {
  const custom = process.env.UPLOAD_ARCHIVE_DIR;
  if (custom) return path.resolve(custom);
  return path.join(process.cwd(), "data", "archive");
}

async function writeUploadToPath(file: File, destPath: string) {
  mkdirSync(path.dirname(destPath), { recursive: true });
  const nodeStream = Readable.fromWeb(
    file.stream() as import("stream/web").ReadableStream,
  );
  await pipeline(nodeStream, createWriteStream(destPath));
}

export async function stageUpload(
  input: StageUploadInput,
): Promise<StageUploadResult> {
  const { file, userId } = input;

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Please select an Excel (.xlsx) file." };
  }

  if (!isXlsxFile(file)) {
    return { ok: false, message: "Only .xlsx files are supported." };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: "File must be 500MB or smaller." };
  }

  const metaError = validateUploadMetadata({
    dataYearThai: input.dataYearThai,
    dataMonthThai: input.dataMonthThai,
    dataPeriod: input.dataPeriod,
    filterProv1: input.filterProv1,
    filterProv2: input.filterProv2,
  });
  if (metaError) {
    return { ok: false, message: metaError };
  }

  const targetType = detectUploadTarget(file.name);
  if (!targetType) {
    return {
      ok: false,
      message:
        "Filename must contain SUM (summary) or DETAIL (detail), but not both.",
    };
  }

  const target =
    targetType === "SUMMARY" ? UploadTarget.SUMMARY : UploadTarget.DETAIL;
  const scheduleMode: ImportScheduleMode =
    input.scheduleMode === "IMMEDIATE" ? "IMMEDIATE" : "SCHEDULED";
  const scheduledAt =
    scheduleMode === "IMMEDIATE" ? new Date() : computeNextScheduleAt();
  const filterProv1 = input.filterProv1.trim();
  const filterProv2 = input.filterProv2.trim();

  const batch = await prisma.uploadBatch.create({
    data: {
      fileName: file.name,
      uploadedById: userId,
      target,
      status: UploadStatus.SCHEDULED,
      filterProv1,
      filterProv2,
      dataYearThai: input.dataYearThai,
      dataMonthThai: input.dataMonthThai,
      dataPeriod: input.dataPeriod,
      scheduledAt,
      fileSizeBytes: BigInt(file.size),
    },
  });

  const relativePath = archiveRelativePath(
    input.dataYearThai,
    input.dataMonthThai,
    input.dataPeriod,
    batch.id,
    file.name,
  );
  const fullDestPath = path.join(getArchiveRoot(), relativePath);
  // Store portable relative path (e.g. "data/archive/2569/09/period-2/...") so host and Docker containers both resolve it cleanly
  const storedArchivePath = `data/archive/${relativePath}`;

  try {
    await writeUploadToPath(file, fullDestPath);
    await prisma.uploadBatch.update({
      where: { id: batch.id },
      data: { archivedFilePath: storedArchivePath },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to store uploaded file.";
    await prisma.uploadBatch.update({
      where: { id: batch.id },
      data: { status: UploadStatus.FAILED, errorMessage: message },
    });
    return { ok: false, message };
  }

  const periodLabel = formatThaiPeriod(
    input.dataYearThai,
    input.dataMonthThai,
    input.dataPeriod,
  );
  const scheduleLabel = scheduledAt.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const message =
    scheduleMode === "IMMEDIATE"
      ? `อัปโหลดสำเร็จ (${periodLabel}, PROV1=${filterProv1}, PROV2=${filterProv2}). ส่งเข้าคิวให้ Worker ประมวลผลทันทีแล้ว`
      : `อัปโหลดสำเร็จ (${periodLabel}, PROV1=${filterProv1}, PROV2=${filterProv2}). จะนำเข้าฐานข้อมูลตามตารางเวลาประมาณ ${scheduleLabel}`;

  return {
    ok: true,
    batchId: batch.id,
    scheduledAt: scheduledAt.toISOString(),
    scheduleMode,
    message,
  };
}
