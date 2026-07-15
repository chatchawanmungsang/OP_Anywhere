import "server-only";

import { prisma } from "@/lib/prisma";
import {
  detectUploadTarget,
  isXlsxFile,
  MAX_UPLOAD_BYTES,
} from "@/lib/eclaim-upload";
import { streamImportXlsx } from "@/lib/stream-xlsx";
import {
  Prisma,
  UploadStatus,
  UploadTarget,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";

export type UploadResult = {
  ok: boolean;
  message: string;
};

async function recordFailedUpload(
  fileName: string,
  uploadedById: string,
  target: UploadTarget | null,
  message: string,
) {
  await prisma.uploadBatch.create({
    data: {
      fileName,
      uploadedById,
      target: target ?? undefined,
      status: UploadStatus.FAILED,
      errorMessage: message,
    },
  });
}

export async function processExcelUpload(
  file: File,
  userId: string,
): Promise<UploadResult> {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Please select an Excel (.xlsx) file." };
  }

  if (!isXlsxFile(file)) {
    return { ok: false, message: "Only .xlsx files are supported." };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: "File must be 500MB or smaller." };
  }

  const targetType = detectUploadTarget(file.name);
  if (!targetType) {
    const message =
      "Filename must contain SUM (summary) or DETAIL (detail), but not both.";
    await recordFailedUpload(file.name, userId, null, message);
    return { ok: false, message };
  }

  const target =
    targetType === "SUMMARY" ? UploadTarget.SUMMARY : UploadTarget.DETAIL;

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "op-upload-"));
  const tmpPath = path.join(tmpDir, file.name);

  try {
    writeFileSync(tmpPath, Buffer.from(await file.arrayBuffer()));

    const batch = await prisma.uploadBatch.create({
      data: {
        fileName: file.name,
        uploadedById: userId,
        target,
        status: UploadStatus.SUCCESS,
        rowCount: 0,
      },
    });

    const imported = await streamImportXlsx(tmpPath, targetType, {
      sourceFileName: file.name,
      uploadedById: userId,
      uploadBatchId: batch.id,
    });

    for (const rows of imported.batches) {
      if (target === UploadTarget.SUMMARY) {
        await prisma.eclaimTransactionSummary.createMany({
          data: rows as Prisma.EclaimTransactionSummaryCreateManyInput[],
        });
      } else {
        await prisma.eclaimTransactionData.createMany({
          data: rows as Prisma.EclaimTransactionDataCreateManyInput[],
        });
      }
    }

    await prisma.uploadBatch.update({
      where: { id: batch.id },
      data: { rowCount: imported.rowCount },
    });

    revalidatePath("/summary");
    revalidatePath("/detail");
    revalidatePath("/upload");

    const tableName =
      target === UploadTarget.SUMMARY
        ? "eclaim_transaction_summary"
        : "eclaim_transaction_data";

    return {
      ok: true,
      message: `Imported ${imported.rowCount} rows into ${tableName}.`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Upload failed unexpectedly.";
    await recordFailedUpload(file.name, userId, target, message);
    return { ok: false, message };
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}
