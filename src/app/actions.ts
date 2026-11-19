"use server";

import { auth, signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canDeleteData, canManageUsers, canUpload } from "@/lib/roles";
import {
  Prisma,
  Role,
  UploadStatus,
  UploadTarget,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const roleSchema = z.enum(["ADMIN", "MANAGER", "USER"]);

export type ActionResult = {
  ok: boolean;
  message: string;
};

export async function loginAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/summary",
    });
    return { ok: true, message: "Signed in" };
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, message: "Invalid email or password." };
    }
    throw error;
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function clearEclaimDataAction(
  target: UploadTarget,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user || !canDeleteData(session.user.role)) {
    return { ok: false, message: "Only admins can delete data." };
  }

  if (target === UploadTarget.SUMMARY) {
    await prisma.eclaimTransactionSummary.deleteMany();
    revalidatePath("/summary");
    return {
      ok: true,
      message: "Cleared all rows from eclaim_transaction_summary.",
    };
  }

  await prisma.eclaimTransactionData.deleteMany();
  revalidatePath("/detail");
  return {
    ok: true,
    message: "Cleared all rows from eclaim_transaction_data.",
  };
}

/** ลบข้อมูลที่นำเข้าสำเร็จของ batch (รายงวด) จากเมนูนำเข้า */
export async function deleteImportBatchDataAction(
  batchId: string,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user || !canUpload(session.user.role)) {
    return { ok: false, message: "ไม่มีสิทธิ์ลบข้อมูลที่นำเข้า" };
  }

  const batch = await prisma.uploadBatch.findUnique({ where: { id: batchId } });
  if (!batch) {
    return { ok: false, message: "ไม่พบรายการนำเข้านี้" };
  }
  if (batch.status !== UploadStatus.SUCCESS) {
    return {
      ok: false,
      message: "ลบได้เฉพาะรายการที่นำเข้าสำเร็จ (SUCCESS) เท่านั้น",
    };
  }
  if (!batch.target) {
    return { ok: false, message: "ไม่ทราบประเภทข้อมูลของรายการนี้" };
  }

  const periodWhere = {
    importYearThai: batch.dataYearThai,
    importMonthThai: batch.dataMonthThai,
    importPeriod: batch.dataPeriod,
  };

  let deleted = 0;
  if (batch.target === UploadTarget.SUMMARY) {
    // ลบทั้งงวด Summary ที่ตรงปี/เดือน/งวด (รวมแถวจาก batch อื่นของงวดเดียวกัน)
    const result = await prisma.eclaimTransactionSummary.deleteMany({
      where: periodWhere,
    });
    deleted = result.count;
  } else {
    const result = await prisma.eclaimTransactionData.deleteMany({
      where: periodWhere,
    });
    deleted = result.count;
  }

  // ทำเครื่องหมาย batch ที่สำเร็จของงวด+target+PROV เดียวกันว่าถูกลบแล้ว
  await prisma.uploadBatch.updateMany({
    where: {
      status: UploadStatus.SUCCESS,
      target: batch.target,
      dataYearThai: batch.dataYearThai,
      dataMonthThai: batch.dataMonthThai,
      dataPeriod: batch.dataPeriod,
      filterProv1: batch.filterProv1,
      filterProv2: batch.filterProv2,
    },
    data: {
      status: UploadStatus.CANCELLED,
      errorMessage: `ข้อมูลถูกลบโดย ${session.user.email} เมื่อ ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} (ลบ ${deleted.toLocaleString()} แถว)`,
      warningMessage: null,
      rowCount: 0,
    },
  });

  revalidatePath("/upload");
  revalidatePath("/summary");
  revalidatePath("/detail");
  revalidatePath("/");

  const periodLabel = `${batch.dataMonthThai}/${batch.dataYearThai} งวด ${batch.dataPeriod}`;
  return {
    ok: true,
    message: `ลบข้อมูล ${batch.target} ของ ${periodLabel} แล้ว ${deleted.toLocaleString()} แถว`,
  };
}

export async function runUploadBatchNowAction(
  batchId: string,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user || !canUpload(session.user.role)) {
    return { ok: false, message: "You do not have permission to run imports." };
  }

  const batch = await prisma.uploadBatch.findUnique({ where: { id: batchId } });
  if (!batch) {
    return { ok: false, message: "ไม่พบรายการอัปโหลดนี้" };
  }

  if (
    batch.status !== UploadStatus.SCHEDULED &&
    batch.status !== UploadStatus.FAILED
  ) {
    return {
      ok: false,
      message:
        "เฉพาะรายการที่อยู่ในสถานะ SCHEDULED หรือ FAILED เท่านั้นที่สั่งประมวลผลได้",
    };
  }

  await prisma.uploadBatch.update({
    where: { id: batchId },
    data: {
      status: UploadStatus.SCHEDULED,
      scheduledAt: new Date(),
      errorMessage: null,
      progressRows: 0,
    },
  });

  revalidatePath("/upload");
  return {
    ok: true,
    message: `สั่งให้ Worker ประมวลผลไฟล์ ${batch.fileName} ทันทีแล้ว`,
  };
}

const userSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: z.string().min(6).optional(),
  role: roleSchema,
  active: z.boolean(),
});

export async function createUserAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user || !canManageUsers(session.user.role)) {
    return { ok: false, message: "Only admins can manage users." };
  }

  const parsed = userSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    name: String(formData.get("name") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    role: String(formData.get("role") ?? "USER"),
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });

  if (!parsed.success) {
    return { ok: false, message: "Invalid user details." };
  }

  if (!parsed.data.password) {
    return { ok: false, message: "Password is required for new users." };
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (existing) {
    return { ok: false, message: "A user with that email already exists." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash,
      role: parsed.data.role as Role,
      active: parsed.data.active,
    },
  });

  revalidatePath("/users");
  return { ok: true, message: "User created." };
}

export async function updateUserAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user || !canManageUsers(session.user.role)) {
    return { ok: false, message: "Only admins can manage users." };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) {
    return { ok: false, message: "Missing user id." };
  }

  const passwordRaw = String(formData.get("password") ?? "");
  const parsed = userSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    name: String(formData.get("name") ?? "").trim(),
    password: passwordRaw || undefined,
    role: String(formData.get("role") ?? "USER"),
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });

  if (!parsed.success) {
    return { ok: false, message: "Invalid user details." };
  }

  if (id === session.user.id && !parsed.data.active) {
    return { ok: false, message: "You cannot deactivate your own account." };
  }

  const data: Prisma.UserUpdateInput = {
    email: parsed.data.email,
    name: parsed.data.name,
    role: parsed.data.role as Role,
    active: parsed.data.active,
  };

  if (parsed.data.password) {
    data.passwordHash = await bcrypt.hash(parsed.data.password, 12);
  }

  try {
    await prisma.user.update({ where: { id }, data });
  } catch {
    return { ok: false, message: "Could not update user (email may be taken)." };
  }

  revalidatePath("/users");
  return { ok: true, message: "User updated." };
}
