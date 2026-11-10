import { prisma } from "@/lib/prisma";
import { streamImportXlsx } from "@/lib/stream-xlsx";
import type { UploadTargetType } from "@/lib/eclaim-upload";
import {
  Prisma,
  UploadStatus,
  UploadTarget,
  type UploadBatch,
} from "@prisma/client";
import { existsSync } from "fs";
import path from "path";

function batchSizeForTarget(target: UploadTarget): number {
  const env = Number(process.env.WORKER_BATCH_SIZE ?? "500");
  return target === UploadTarget.DETAIL ? Math.min(env, 300) : env;
}

/**
 * Resolve archivedFilePath across Windows host and Linux Docker container.
 * Handles legacy Windows absolute paths like "C:\...\data\archive\2569\..."
 * as well as portable relative paths like "data/archive/2569/...".
 */
export function resolveArchivedFilePath(storedPath: string): string {
  const normalized = storedPath.replace(/\\/g, "/");
  const archiveMarker = "/data/archive/";
  const markerIdx = normalized.lastIndexOf(archiveMarker);
  if (markerIdx !== -1) {
    const relFromMarker = normalized.slice(markerIdx + archiveMarker.length);
    const archiveRoot = process.env.UPLOAD_ARCHIVE_DIR
      ? path.resolve(process.env.UPLOAD_ARCHIVE_DIR)
      : path.join(process.cwd(), "data", "archive");
    const candidate = path.join(archiveRoot, relFromMarker);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  if (normalized.startsWith("data/archive/")) {
    const relFromMarker = normalized.slice("data/archive/".length);
    const archiveRoot = process.env.UPLOAD_ARCHIVE_DIR
      ? path.resolve(process.env.UPLOAD_ARCHIVE_DIR)
      : path.join(process.cwd(), "data", "archive");
    return path.join(archiveRoot, relFromMarker);
  }

  return path.isAbsolute(storedPath)
    ? storedPath
    : path.join(process.cwd(), normalized);
}

export async function claimNextDueJob(): Promise<UploadBatch | null> {
  const maxJobs = Number(process.env.WORKER_MAX_JOBS_PER_RUN ?? "1");
  const due = await prisma.uploadBatch.findMany({
    where: {
      status: UploadStatus.SCHEDULED,
      scheduledAt: { lte: new Date() },
      archivedFilePath: { not: null },
    },
    orderBy: { scheduledAt: "asc" },
    take: maxJobs,
  });

  for (const job of due) {
    const updated = await prisma.uploadBatch.updateMany({
      where: { id: job.id, status: UploadStatus.SCHEDULED },
      data: {
        status: UploadStatus.PROCESSING,
        startedAt: new Date(),
      },
    });
    if (updated.count === 1) {
      return job;
    }
  }
  return null;
}

export async function processUploadJob(batchId: string): Promise<void> {
  const batch = await prisma.uploadBatch.findUnique({ where: { id: batchId } });
  if (!batch || !batch.archivedFilePath || !batch.target) {
    throw new Error("Upload job not found or missing archived file.");
  }

  const xlsxPath = resolveArchivedFilePath(batch.archivedFilePath);

  const targetType: UploadTargetType =
    batch.target === UploadTarget.SUMMARY ? "SUMMARY" : "DETAIL";

  const importMeta = {
    sourceFileName: batch.fileName,
    uploadedById: batch.uploadedById,
    uploadBatchId: batch.id,
    importYearThai: batch.dataYearThai,
    importMonthThai: batch.dataMonthThai,
    importPeriod: batch.dataPeriod,
    importFileName: batch.fileName,
    importUploadedAt: batch.createdAt,
  };

  try {
    // Clear any partial rows from previous attempts of this batch before importing
    if (batch.target === UploadTarget.SUMMARY) {
      await prisma.eclaimTransactionSummary.deleteMany({
        where: { uploadBatchId: batch.id },
      });
    } else {
      await prisma.eclaimTransactionData.deleteMany({
        where: { uploadBatchId: batch.id },
      });
    }

    const imported = await streamImportXlsx(xlsxPath, targetType, importMeta, {
      batchSize: batchSizeForTarget(batch.target),
      filterProv1: batch.filterProv1,
      filterProv2: batch.filterProv2,
      onBatch: async (rows) => {
        if (batch.target === UploadTarget.SUMMARY) {
          await prisma.eclaimTransactionSummary.createMany({
            data: rows as Prisma.EclaimTransactionSummaryCreateManyInput[],
          });
        } else {
          await prisma.eclaimTransactionData.createMany({
            data: rows as Prisma.EclaimTransactionDataCreateManyInput[],
          });
        }
      },
      onProgress: async ({ rowCount, rowsSkipped }) => {
        await prisma.uploadBatch.update({
          where: { id: batch.id },
          data: { progressRows: rowCount, rowsSkipped },
        });
      },
    });

    await prisma.uploadBatch.update({
      where: { id: batch.id },
      data: {
        status: UploadStatus.SUCCESS,
        rowCount: imported.rowCount,
        rowsSkipped: imported.rowsSkipped,
        sheetsProcessed: imported.sheetsProcessed,
        rowsPerSheet: imported.rowsPerSheet,
        progressRows: imported.rowCount,
        completedAt: new Date(),
        errorMessage: null,
      },
    });

    console.log(
      `[import-job] Imported ${imported.rowCount} rows (skipped ${imported.rowsSkipped}) for ${batch.fileName}`,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Import failed unexpectedly.";
    await prisma.uploadBatch.update({
      where: { id: batch.id },
      data: {
        status: UploadStatus.FAILED,
        errorMessage: message,
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

export async function runImportWorker(): Promise<{
  processed: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let processed = 0;
  const maxJobs = Number(process.env.WORKER_MAX_JOBS_PER_RUN ?? "1");

  for (let i = 0; i < maxJobs; i++) {
    const job = await claimNextDueJob();
    if (!job) break;
    try {
      await processUploadJob(job.id);
      processed++;
      console.log(
        `[import-worker] SUCCESS ${job.fileName} (${job.id})`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown import error";
      errors.push(`${job.fileName}: ${message}`);
      console.error(`[import-worker] FAILED ${job.fileName}:`, message);
    }
  }

  return { processed, errors };
}
