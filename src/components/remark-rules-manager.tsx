"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteRemarkRuleAction,
  saveRemarkRuleAction,
  toggleRemarkRuleAction,
  updateRulePriorityAction,
  type RemarkActionResult,
} from "@/app/remark/actions";
import {
  StickyTableFrame,
  stickyThClass,
  stickyTheadClass,
} from "@/components/sticky-table-frame";
import {
  REMARK_BUILDER_FIELDS,
  REMARK_OPERATORS,
  type BuilderCondition,
  type BuilderOperator,
} from "@/lib/remark-types";

export type RemarkRuleDto = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  remarkText: string;
  outcome: string;
  priority: number;
  active: boolean;
  conditionMode: string;
  conditionsJson: unknown;
  sqlWhere: string;
  matchedCountInPeriod: number;
};

type Props = {
  rules: RemarkRuleDto[];
  canManage: boolean;
};

const EMPTY_CONDITION: BuilderCondition = {
  field: "in_same_cup_network",
  operator: "EQ",
  value: "Y",
};

export function RemarkRulesManager({ rules, canManage }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<RemarkActionResult | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [remarkText, setRemarkText] = useState("");
  const [outcome, setOutcome] = useState<"PRUNED_OUT" | "PASS">("PRUNED_OUT");
  const [priority, setPriority] = useState<number>(60);
  const [active, setActive] = useState<boolean>(true);
  const [conditionMode, setConditionMode] = useState<"BUILDER" | "SQL">("BUILDER");
  const [conditions, setConditions] = useState<BuilderCondition[]>([
    { ...EMPTY_CONDITION },
  ]);
  const [sqlWhere, setSqlWhere] = useState("");

  function openNewForm() {
    setEditingId(null);
    const nextPrio =
      rules.length > 0 ? Math.max(...rules.map((r) => r.priority)) + 10 : 10;
    setCode(`R0${rules.length + 1}_CUSTOM`);
    setName("");
    setDescription("");
    setRemarkText("คัดออก: ");
    setOutcome("PRUNED_OUT");
    setPriority(nextPrio);
    setActive(true);
    setConditionMode("BUILDER");
    setConditions([{ ...EMPTY_CONDITION }]);
    setSqlWhere("");
    setShowForm(true);
    setFeedback(null);
  }

  function openEditForm(rule: RemarkRuleDto) {
    setEditingId(rule.id);
    setCode(rule.code);
    setName(rule.name);
    setDescription(rule.description ?? "");
    setRemarkText(rule.remarkText);
    setOutcome(rule.outcome === "PASS" ? "PASS" : "PRUNED_OUT");
    setPriority(rule.priority);
    setActive(rule.active);
    const isBuilder =
      rule.conditionMode === "BUILDER" &&
      Array.isArray(rule.conditionsJson) &&
      rule.conditionsJson.length > 0;
    setConditionMode(isBuilder ? "BUILDER" : "SQL");
    setConditions(
      isBuilder
        ? (rule.conditionsJson as BuilderCondition[])
        : [{ ...EMPTY_CONDITION }],
    );
    setSqlWhere(rule.sqlWhere);
    setShowForm(true);
    setFeedback(null);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveRemarkRuleAction({
        id: editingId ?? undefined,
        code,
        name,
        description,
        remarkText,
        outcome,
        priority,
        active,
        conditionMode,
        conditions: conditionMode === "BUILDER" ? conditions : undefined,
        sqlWhere: conditionMode === "SQL" ? sqlWhere : undefined,
      });
      setFeedback(res);
      if (res.ok) {
        setShowForm(false);
        setEditingId(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {feedback ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            feedback.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            ตารางกฎการคัดกรอง (Database Rules: <code className="text-teal-800">remark_rules</code>)
          </h2>
          <p className="text-sm text-slate-600">
            ระบบจะประมวลผลกฎที่เปิดใช้งานเรียงตามลำดับความสำคัญ (Priority น้อยทำก่อน) และบันทึกเหตุผลลงตาราง Summary
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={openNewForm}
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-teal-800"
          >
            + เพิ่มกฎใหม่
          </button>
        ) : null}
      </div>

      {showForm && canManage ? (
        <form
          onSubmit={handleSave}
          className="space-y-4 rounded-xl border border-teal-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-base font-semibold text-slate-900">
              {editingId ? `แก้ไขกฎ: ${code}` : "สร้างกฎการคัดกรองใหม่"}
            </h3>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm text-slate-500 hover:text-slate-800"
            >
              ปิดหน้าต่าง
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                รหัสกฎ (Rule Code)
              </label>
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="เช่น R06_OP_CHECK"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                ลำดับความสำคัญ (Priority)
              </label>
              <input
                type="number"
                required
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                ผลลัพธ์เมื่อตรงเงื่อนไข
              </label>
              <select
                value={outcome}
                onChange={(e) =>
                  setOutcome(e.target.value as "PRUNED_OUT" | "PASS")
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="PRUNED_OUT">ไม่ผ่าน / คัดออก (PRUNED_OUT)</option>
                <option value="PASS">ผ่านเกณฑ์พิเศษ (PASS)</option>
              </select>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-teal-700"
                />
                เปิดใช้งานกฎนี้ (Active)
              </label>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                ชื่อกฎ
              </label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="สรุปสั้นๆ ของกฎข้อนี้"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                ข้อความที่จะเติมลงในช่อง Remark ของ Summary
              </label>
              <input
                required
                value={remarkText}
                onChange={(e) => setRemarkText(e.target.value)}
                placeholder="เช่น คัดออก: หน่วยบริการอยู่ในเครือข่าย CUP เดียวกัน"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              คำอธิบายเพิ่มเติม / ที่มาจาก Orange Data Mining (ไม่บังคับ)
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="เช่น ความแม่นยำ 99.8% จากโมเดล Decision Tree"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                รูปแบบการกำหนดเงื่อนไข
              </span>
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setConditionMode("BUILDER")}
                  className={`rounded-md px-3 py-1 font-medium ${
                    conditionMode === "BUILDER"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  ตัวสร้างเงื่อนไข (Condition Builder)
                </button>
                <button
                  type="button"
                  onClick={() => setConditionMode("SQL")}
                  className={`rounded-md px-3 py-1 font-medium ${
                    conditionMode === "SQL"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  นิพจน์ SQL ขั้นสูง (PostgreSQL WHERE)
                </button>
              </div>
            </div>

            {conditionMode === "BUILDER" ? (
              <div className="space-y-2">
                {conditions.map((cond, idx) => {
                  const fieldMeta = REMARK_BUILDER_FIELDS.find(
                    (f) => f.key === cond.field,
                  );
                  return (
                    <div
                      key={idx}
                      className="grid gap-2 sm:grid-cols-[1.5fr_1fr_1.3fr_auto]"
                    >
                      <select
                        value={cond.field}
                        onChange={(e) => {
                          const next = [...conditions];
                          next[idx] = { ...cond, field: e.target.value };
                          setConditions(next);
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                      >
                        {REMARK_BUILDER_FIELDS.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </select>

                      <select
                        value={cond.operator}
                        onChange={(e) => {
                          const next = [...conditions];
                          next[idx] = {
                            ...cond,
                            operator: e.target.value as BuilderOperator,
                          };
                          setConditions(next);
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                      >
                        {REMARK_OPERATORS.map((op) => (
                          <option key={op.value} value={op.value}>
                            {op.label}
                          </option>
                        ))}
                      </select>

                      <input
                        required
                        value={cond.value}
                        onChange={(e) => {
                          const next = [...conditions];
                          next[idx] = { ...cond, value: e.target.value };
                          setConditions(next);
                        }}
                        placeholder={fieldMeta?.placeholder ?? "ระบุค่า..."}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
                      />

                      <button
                        type="button"
                        disabled={conditions.length <= 1}
                        onClick={() =>
                          setConditions(conditions.filter((_, i) => i !== idx))
                        }
                        className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs text-red-700 disabled:opacity-40"
                      >
                        ลบ
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() =>
                    setConditions([...conditions, { ...EMPTY_CONDITION }])
                  }
                  className="mt-2 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  + เพิ่มเงื่อนไขร่วม (AND)
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <textarea
                  rows={3}
                  required
                  value={sqlWhere}
                  onChange={(e) => setSqlWhere(e.target.value)}
                  placeholder="เช่น (s.charge_cost <= 50 AND ho.hosp_level LIKE 'A%')"
                  className="w-full rounded-lg border border-slate-300 bg-white p-2.5 font-mono text-xs text-slate-800"
                />
                <p className="text-xs text-slate-500">
                  ตัวแปรตารางที่ใช้ได้: <code>s</code> ={" "}
                  <code>eclaim_transaction_summary</code>, <code>ho</code> ={" "}
                  <code>ref_health_office</code> (เชื่อมด้วย HCODE),{" "}
                  <code>net</code> = <code>ref_cup_network</code> (เชื่อม HMAIN2 + HCODE)
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "กำลังตรวจสอบและบันทึก..." : "บันทึกกฎลงฐานข้อมูล"}
            </button>
          </div>
        </form>
      ) : null}

      <StickyTableFrame>
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className={stickyTheadClass}>
            <tr>
              <th className={stickyThClass}>ลำดับ</th>
              <th className={stickyThClass}>สถานะ</th>
              <th className={stickyThClass}>รหัสกฎ / ชื่อกฎ</th>
              <th className={stickyThClass}>ผลลัพธ์</th>
              <th className={stickyThClass}>ข้อความ Remark & เงื่อนไข SQL</th>
              <th className={`${stickyThClass} text-right`}>
                จำนวนที่ตรงในงวดนี้
              </th>
              {canManage ? (
                <th className={`${stickyThClass} text-right`}>จัดการ</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr
                key={r.id}
                className={`border-t border-slate-100 ${
                  r.active ? "bg-white" : "bg-slate-50/70 opacity-65"
                }`}
              >
                <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-700">
                  {canManage ? (
                    <div className="flex items-center gap-1">
                      <span>{r.priority}</span>
                      <button
                        type="button"
                        title="เลื่อนขึ้น"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await updateRulePriorityAction(
                              r.id,
                              Math.max(1, r.priority - 15),
                            );
                            router.refresh();
                          })
                        }
                        className="rounded border border-slate-200 px-1 text-slate-500 hover:bg-slate-100"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        title="เลื่อนลง"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await updateRulePriorityAction(r.id, r.priority + 15);
                            router.refresh();
                          })
                        }
                        className="rounded border border-slate-200 px-1 text-slate-500 hover:bg-slate-100"
                      >
                        ↓
                      </button>
                    </div>
                  ) : (
                    r.priority
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-3">
                  {canManage ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const res = await toggleRemarkRuleAction(
                            r.id,
                            !r.active,
                          );
                          setFeedback(res);
                          router.refresh();
                        })
                      }
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        r.active
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {r.active ? "เปิดใช้" : "ปิดไว้"}
                    </button>
                  ) : (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        r.active
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {r.active ? "เปิดใช้" : "ปิดไว้"}
                    </span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="font-mono text-xs font-semibold text-teal-800">
                    {r.code}
                  </div>
                  <div className="font-medium text-slate-900">{r.name}</div>
                  {r.description ? (
                    <div className="mt-0.5 text-xs text-slate-500">
                      {r.description}
                    </div>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-3 py-3">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                      r.outcome === "PASS"
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                        : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                    }`}
                  >
                    {r.outcome === "PASS" ? "PASS" : "ไม่ผ่าน (คัดออก)"}
                  </span>
                </td>
                <td className="max-w-md px-3 py-3">
                  <div className="text-xs font-medium text-slate-800">
                    {r.remarkText}
                  </div>
                  <code className="mt-1 block truncate rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                    {r.sqlWhere}
                  </code>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-sm font-semibold text-slate-800">
                  {r.matchedCountInPeriod.toLocaleString()}
                </td>
                {canManage ? (
                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    <div className="inline-flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditForm(r)}
                        className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          if (
                            !confirm(`ยืนยันการลบกฎ ${r.code} ออกจากฐานข้อมูล?`)
                          ) {
                            return;
                          }
                          startTransition(async () => {
                            const res = await deleteRemarkRuleAction(r.id);
                            setFeedback(res);
                            router.refresh();
                          });
                        }}
                        className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                      >
                        ลบ
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </StickyTableFrame>
    </div>
  );
}
