import { auth } from "@/auth";
import { canUpload } from "@/lib/roles";
import { processExcelUpload } from "@/lib/upload-service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

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

    const result = await processExcelUpload(file, session.user.id);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Upload failed unexpectedly.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
