"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canUpload } from "@/lib/roles";
import {
  compileBuilderConditionsToSql,
  executeRemarkRulesForPeriod,
  validateRuleSqlWhere,
  type RunRemarkSummary,
} from "@/lib/remark-engine";
import type { BuilderCondition } from "@/lib/remark-types";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

export type RemarkActionResult = {
  ok: boolean;
  message: string;
  summary?: RunRemarkSummary;
};

export async function runRemarkCheckAction(input: {
  yearThai: number;
  monthThai: number;
  period: number;
}): Promise<RemarkActionResult> {
  const session = await auth();
  if (!session?.user || !canUpload(session.user.role)) {
    return {
      ok: false,
      message: "เฉพาะผู้ดูแลระบบ (Admin) หรือ Manager เท่านั้นที่สั่งรันตรวจสอบได้",
    };
  }

  try {
    const summary = await executeRemarkRulesForPeriod(input);
    revalidatePath("/remark");
    if (summary.totalProcessed === 0) {
      return {
        ok: false,
        message: "ไม่พบข้อมูลในเดือน/งวดที่เลือกสำหรับตรวจสอบ",
      };
    }
    return {
      ok: true,
      message: `ตรวจสอบสำเร็จ ${summary.totalProcessed.toLocaleString()} รายการ (ผ่าน ${summary.passCount.toLocaleString()} · ไม่ผ่าน ${summary.prunedOutCount.toLocaleString()}) ใน ${(summary.elapsedMs / 1000).toFixed(2)} วินาที`,
      summary,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `รันตรวจสอบไม่สำเร็จ: ${msg}` };
  }
}

export type SaveRuleInput = {
  id?: string;
  code: string;
  name: string;
  description?: string;
  remarkText: string;
  outcome: "PRUNED_OUT" | "PASS";
  priority: number;
  active: boolean;
  conditionMode: "BUILDER" | "SQL";
  conditions?: BuilderCondition[];
  sqlWhere?: string;
};

export async function saveRemarkRuleAction(
  input: SaveRuleInput,
): Promise<RemarkActionResult> {
  const session = await auth();
  if (!session?.user || !canUpload(session.user.role)) {
    return {
      ok: false,
      message: "ไม่มีสิทธิ์จัดการกฎการคัดกรอง",
    };
  }

  const code = input.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "_");
  const name = input.name.trim();
  const remarkText = input.remarkText.trim();
  const priority = Number.isFinite(Number(input.priority))
    ? Math.trunc(Number(input.priority))
    : 100;
  const outcome = input.outcome === "PASS" ? "PASS" : "PRUNED_OUT";

  if (!code || !name || !remarkText) {
    return {
      ok: false,
      message: "กรุณากรอกรหัสกฎ ชื่อกฎ และข้อความ Remark ให้ครบถ้วน",
    };
  }

  try {
    let finalSqlWhere = "";
    let conditionsJson: Prisma.InputJsonValue | typeof Prisma.JsonNull =
      Prisma.JsonNull;

    if (input.conditionMode === "BUILDER") {
      const conds = input.conditions ?? [];
      finalSqlWhere = compileBuilderConditionsToSql(conds);
      conditionsJson = conds as unknown as Prisma.InputJsonValue;
    } else {
      finalSqlWhere = (input.sqlWhere ?? "").trim();
    }

    await validateRuleSqlWhere(finalSqlWhere);

    if (input.id) {
      await prisma.remarkRule.update({
        where: { id: input.id },
        data: {
          code,
          name,
          description: input.description?.trim() || null,
          remarkText,
          outcome,
          priority,
          active: Boolean(input.active),
          conditionMode: input.conditionMode,
          conditionsJson,
          sqlWhere: finalSqlWhere,
        },
      });
      revalidatePath("/remark");
      return { ok: true, message: `บันทึกการแก้ไขกฎ ${code} เรียบร้อยแล้ว` };
    }

    await prisma.remarkRule.create({
      data: {
        code,
        name,
        description: input.description?.trim() || null,
        remarkText,
        outcome,
        priority,
        active: Boolean(input.active),
        conditionMode: input.conditionMode,
        conditionsJson,
        sqlWhere: finalSqlWhere,
      },
    });
    revalidatePath("/remark");
    return { ok: true, message: `เพิ่มกฎใหม่ ${code} เรียบร้อยแล้ว` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: msg };
  }
}

export async function toggleRemarkRuleAction(
  id: string,
  active: boolean,
): Promise<RemarkActionResult> {
  const session = await auth();
  if (!session?.user || !canUpload(session.user.role)) {
    return { ok: false, message: "ไม่มีสิทธิ์แก้ไขสถานะกฎ" };
  }

  await prisma.remarkRule.update({
    where: { id },
    data: { active },
  });
  revalidatePath("/remark");
  return {
    ok: true,
    message: active ? "เปิดใช้งานกฎแล้ว" : "ปิดใช้งานกฎแล้ว",
  };
}

export async function updateRulePriorityAction(
  id: string,
  priority: number,
): Promise<RemarkActionResult> {
  const session = await auth();
  if (!session?.user || !canUpload(session.user.role)) {
    return { ok: false, message: "ไม่มีสิทธิ์จัดลำดับกฎ" };
  }

  await prisma.remarkRule.update({
    where: { id },
    data: { priority: Math.trunc(priority) },
  });
  revalidatePath("/remark");
  return { ok: true, message: "อัปเดตลำดับความสำคัญเรียบร้อยแล้ว" };
}

export async function deleteRemarkRuleAction(
  id: string,
): Promise<RemarkActionResult> {
  const session = await auth();
  if (!session?.user || !canUpload(session.user.role)) {
    return { ok: false, message: "ไม่มีสิทธิ์ลบกฎ" };
  }

  await prisma.remarkRule.delete({ where: { id } });
  revalidatePath("/remark");
  return { ok: true, message: "ลบกฎเรียบร้อยแล้ว" };
}
