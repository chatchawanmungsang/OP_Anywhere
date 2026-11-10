import { auth } from "@/auth";
import { canUpload } from "@/lib/roles";
import { stageUpload, type ImportScheduleMode } from "@/lib/upload-service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !canUpload(session.user.role)) {
    return NextResponse.json(
      { ok: false, message: "You do not have permission to upload." },
      { status: 403 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, message: "Missing file in upload request." },
        { status: 400 },
      );
    }

    const dataYearThai = Number(formData.get("dataYearThai"));
    const dataMonthThai = Number(formData.get("dataMonthThai"));
    const dataPeriod = Number(formData.get("dataPeriod"));
    const filterProv1 = String(formData.get("filterProv1") ?? "").trim();
    const filterProv2 = String(formData.get("filterProv2") ?? "").trim();
    const rawMode = String(formData.get("scheduleMode") ?? "SCHEDULED")
      .trim()
      .toUpperCase();
    const scheduleMode: ImportScheduleMode =
      rawMode === "IMMEDIATE" ? "IMMEDIATE" : "SCHEDULED";

    const result = await stageUpload({
      file,
      userId: session.user.id,
      dataYearThai,
      dataMonthThai,
      dataPeriod,
      filterProv1,
      filterProv2,
      scheduleMode,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Upload failed unexpectedly.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
