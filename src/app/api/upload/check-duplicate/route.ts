import { auth } from "@/auth";
import { canUpload } from "@/lib/roles";
import { findSuccessfulImportConflict } from "@/lib/upload-service";
import { detectUploadTarget } from "@/lib/eclaim-upload";
import { UploadTarget } from "@prisma/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canUpload(session.user.role)) {
    return NextResponse.json(
      { ok: false, message: "ไม่มีสิทธิ์ตรวจสอบไฟล์" },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as {
      fileName?: string;
      dataYearThai?: number;
      dataMonthThai?: number;
      dataPeriod?: number;
      filterProv1?: string;
      filterProv2?: string;
    };

    const fileName = String(body.fileName ?? "").trim();
    if (!fileName) {
      return NextResponse.json({
        ok: true,
        duplicate: false,
        message: null,
      });
    }

    const targetType = detectUploadTarget(fileName);
    if (!targetType) {
      return NextResponse.json({
        ok: true,
        duplicate: false,
        message: null,
      });
    }

    const target =
      targetType === "SUMMARY" ? UploadTarget.SUMMARY : UploadTarget.DETAIL;
    const conflict = await findSuccessfulImportConflict({
      fileName,
      target,
      dataYearThai: Number(body.dataYearThai) || 0,
      dataMonthThai: Number(body.dataMonthThai) || 0,
      dataPeriod: Number(body.dataPeriod) || 0,
      filterProv1: String(body.filterProv1 ?? "").trim(),
      filterProv2: String(body.filterProv2 ?? "").trim(),
    });

    return NextResponse.json({
      ok: true,
      duplicate: Boolean(conflict),
      message: conflict,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "ตรวจสอบไฟล์ซ้ำไม่สำเร็จ";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
