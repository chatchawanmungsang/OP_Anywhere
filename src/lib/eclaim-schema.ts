import "server-only";

import { Decimal } from "@prisma/client/runtime/library";
import type { UploadTargetType } from "./eclaim-upload";

export type { UploadTargetType };

export type ColumnType = "bigint" | "int" | "decimal" | "float" | "string" | "text";

export type ColumnDef = {
  excelHeader: string;
  sqlColumn: string;
  prismaField: string;
  type: ColumnType;
};

function col(
  excelHeader: string,
  sqlColumn: string,
  prismaField: string,
  type: ColumnType,
): ColumnDef {
  return { excelHeader, sqlColumn, prismaField, type };
}

export const SUMMARY_COLUMNS: ColumnDef[] = [
  col("TRAN_ID", "tran_id", "tranId", "bigint"),
  col("HCODE", "hcode", "hcode", "string"),
  col("HNAME", "hname", "hname", "string"),
  col("PROV1", "prov1", "prov1", "string"),
  col("PROV1_NAME", "prov1_name", "prov1Name", "string"),
  col("RG1", "rg1", "rg1", "int"),
  col("HTYPE", "htype", "htype", "string"),
  col("REP", "rep", "rep", "string"),
  col("HN", "hn", "hn", "string"),
  col("AGE_YY", "age_yy", "ageYy", "int"),
  col("AGE_MM", "age_mm", "ageMm", "int"),
  col("DOB_AF", "dob_af", "dobAf", "string"),
  col("MAININSCL_AF", "maininscl_af", "maininsclAf", "string"),
  col("SUBINSCL_AF", "subinscl_af", "subinsclAf", "string"),
  col("HMAIN2", "hmain2", "hmain2", "string"),
  col("HNAME2", "hname2", "hname2", "string"),
  col("PROV2", "prov2", "prov2", "string"),
  col("RG2", "rg2", "rg2", "int"),
  col("HSUB_AF", "hsub_af", "hsubAf", "string"),
  col("HSUB_AF_NAME", "hsub_af_name", "hsubAfName", "string"),
  col("HSUB_AF_DES", "hsub_af_des", "hsubAfDes", "string"),
  col("PERSON_TYPE_NAME", "person_type_name", "personTypeName", "string"),
  col("YM_DATEADM", "ym_dateadm", "ymDateadm", "string"),
  col("DATEADM", "dateadm", "dateadm", "string"),
  col("TIMEADM", "timeadm", "timeadm", "string"),
  col("STATUS", "status", "status", "int"),
  col("CODE_ID", "code_id", "codeId", "string"),
  col("AEN", "aen", "aen", "string"),
  col("DX", "dx", "dx", "text"),
  col("PROC", "proc", "proc", "text"),
  col("PROJECTCODE", "projectcode", "projectcode", "string"),
  col("PS_AF_RATE", "ps_af_rate", "psAfRate", "string"),
  col("FUND_AF", "fund_af", "fundAf", "string"),
  col("SUB_FUND", "sub_fund", "subFund", "string"),
  col("CHARGE_COST", "charge_cost", "chargeCost", "decimal"),
  col("SUMS_COST", "sums_cost", "sumsCost", "decimal"),
  col("DATE_SEND", "date_send", "dateSend", "float"),
  col("FILENAME_SEND", "filename_send", "filenameSend", "string"),
  ...Array.from({ length: 19 }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return [
      col(`SEV${n}`, `sev${n}`, `sev${n}`, "decimal"),
      col(`SEV${n}_PAID`, `sev${n}_paid`, `sev${n}Paid`, "decimal"),
    ];
  }).flat(),
  col("HCODE_PAID", "hcode_paid", "hcodePaid", "string"),
  col("STMT_PERIOD", "stmt_period", "stmtPeriod", "string"),
  col("STATUS_CARDB", "status_cardb", "statusCardb", "int"),
  col("APPEAL_AUDIT", "appeal_audit", "appealAudit", "string"),
  col("PDX", "pdx", "pdx", "string"),
  col("PDX_NAME", "pdx_name", "pdxName", "text"),
];

export const DETAIL_COLUMNS: ColumnDef[] = [
  col("HCODE", "hcode", "hcode", "string"),
  col("HNAME", "hname", "hname", "string"),
  col("HTYPE", "htype", "htype", "string"),
  col("HMAIN2", "hmain2", "hmain2", "string"),
  col("HMAIN2_NAME", "hmain2_name", "hmain2Name", "string"),
  col("HSUB_AF", "hsub_af", "hsubAf", "string"),
  col("HSUB_AF_NAME", "hsub_af_name", "hsubAfName", "string"),
  col("HSUB_AF_DES", "hsub_af_des", "hsubAfDes", "string"),
  col("HCODE_PAID", "hcode_paid", "hcodePaid", "string"),
  col("HCODE_PAID_NAME", "hcode_paid_name", "hcodePaidName", "string"),
  col("TRAN_ID", "tran_id", "tranId", "bigint"),
  col("PARENT_TRAN_ID", "parent_tran_id", "parentTranId", "bigint"),
  col("HN", "hn", "hn", "string"),
  col("AN", "an", "an", "string"),
  col("AGE_YY", "age_yy", "ageYy", "int"),
  col("AGE_MM", "age_mm", "ageMm", "int"),
  col("DOB_AF", "dob_af", "dobAf", "string"),
  col("MAININSCL_AF", "maininscl_af", "maininsclAf", "string"),
  col("SUBINSCL_AF", "subinscl_af", "subinsclAf", "string"),
  col("DATEADM", "dateadm", "dateadm", "string"),
  col("TIMEADM", "timeadm", "timeadm", "string"),
  col("DATEDSC", "datedsc", "datedsc", "string"),
  col("TIMEDSC", "timedsc", "timedsc", "string"),
  col("PERSON_TYPE", "person_type", "personType", "string"),
  col("HCODE_REGION", "hcode_region", "hcodeRegion", "string"),
  col("HCODE_REGION_NAME", "hcode_region_name", "hcodeRegionName", "string"),
  col("PROV1", "prov1", "prov1", "string"),
  col("HMAIN_REGION", "hmain_region", "hmainRegion", "string"),
  col("HMAIN_REGION_NAME", "hmain_region_name", "hmainRegionName", "string"),
  col("PROV2", "prov2", "prov2", "string"),
  col("PDX", "pdx", "pdx", "string"),
  col("SDX_DIAGNOSIS", "sdx_diagnosis", "sdxDiagnosis", "text"),
  col("PROCEDURES", "procedures", "procedures", "text"),
  col("SUB_FUND", "sub_fund", "subFund", "string"),
  col("SUB_FUND_NAME", "sub_fund_name", "subFundName", "string"),
  col("ยอดเบิก", "ยอดเบิก", "amountClaim", "decimal"),
  col("ยอดจ่าย", "ยอดจ่าย", "amountPaid", "decimal"),
  col("ITEM_CODE", "item_code", "itemCode", "string"),
  col("SEV_GROUP", "sev_group", "sevGroup", "string"),
  col("REQ_QTY", "req_qty", "reqQty", "int"),
  col("PAID_QTY", "paid_qty", "paidQty", "int"),
  col("ราคากลาง", "ราคากลาง", "unitPrice", "decimal"),
  col("TMT_ID", "tmt_id", "tmtId", "string"),
  col("ITEM_NAME", "item_name", "itemName", "text"),
  col("DOSAGEFORM", "dosageform", "dosageform", "string"),
  col("หน่วยยา", "หน่วยยา", "drugUnit", "string"),
  col("กลุ่มยาตามบัญชีฯ (NHSO)", "กลุ่มยาตามบัญชีฯ (NHSO)", "nhsoDrugGroup", "string"),
  col("กลุ่มยาตามโรค", "กลุ่มยาตามโรค", "diseaseDrugGroup", "string"),
  col("STMT_PERIOD", "stmt_period", "stmtPeriod", "string"),
  col("ORG_DATE_SEND", "org_date_send", "orgDateSend", "string"),
  col("VA", "va", "va", "string"),
  col("DENY", "deny", "deny", "string"),
  col("CODE_NAME", "code_name", "codeName", "text"),
  col("STATUS_CARDB", "status_cardb", "statusCardb", "int"),
  col("PAID_MODEL", "paid_model", "paidModel", "int"),
  col("OPTYPE", "optype", "optype", "string"),
  col("OPTYPE_DES", "optype_des", "optypeDes", "string"),
  col("GYEAR", "gyear", "gyear", "int"),
  col("REMARK", "remark", "remark", "text"),
  col("HMAIN_REFER_IN", "hmain_refer_in", "hmainReferIn", "string"),
  col("ORG_GYEAR", "org_gyear", "orgGyear", "int"),
  col("AUDIT_RESULTS", "audit_results", "auditResults", "text"),
  col("DETAIL", "detail", "detail", "text"),
  col("PAYMENT_TYPE", "payment_type", "paymentType", "string"),
];

export function columnsForTarget(target: UploadTargetType): ColumnDef[] {
  return target === "SUMMARY" ? SUMMARY_COLUMNS : DETAIL_COLUMNS;
}

export function expectedExcelHeaders(target: UploadTargetType): string[] {
  return columnsForTarget(target).map((c) => c.excelHeader);
}

export function normalizeHeader(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function headersMatch(
  expected: string[],
  incoming: string[],
): { ok: true } | { ok: false; missing: string[]; extra: string[] } {
  const norm = (h: string) => normalizeHeader(h).toUpperCase();
  const expectedSet = new Set(expected.map(norm));
  const incomingSet = new Set(incoming.map(norm));
  const missing = expected.filter((h) => !incomingSet.has(norm(h)));
  const extra = incoming.filter((h) => !expectedSet.has(norm(h)));
  if (missing.length || extra.length) {
    return { ok: false, missing, extra };
  }
  return { ok: true };
}

export function coerceValue(
  raw: string | null | undefined,
  type: ColumnType,
): unknown {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (value === "") return null;

  switch (type) {
    case "bigint": {
      const n = value.replace(/,/g, "");
      if (!/^-?\d+(\.\d+)?$/.test(n)) return null;
      return BigInt(n.split(".")[0]!);
    }
    case "int": {
      const n = Number(value.replace(/,/g, ""));
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    case "decimal":
      return new Decimal(value.replace(/,/g, ""));
    case "float": {
      const n = Number(value.replace(/,/g, ""));
      return Number.isFinite(n) ? n : null;
    }
    case "text":
    case "string":
    default:
      return value;
  }
}

export function buildHeaderIndexMap(
  headers: string[],
  columns: ColumnDef[],
): Map<number, ColumnDef> {
  const norm = (h: string) => normalizeHeader(h).toUpperCase();
  const byHeader = new Map(columns.map((c) => [norm(c.excelHeader), c]));
  const map = new Map<number, ColumnDef>();
  headers.forEach((h, index) => {
    const colDef = byHeader.get(norm(h));
    if (colDef) map.set(index, colDef);
  });
  return map;
}

export function buildHeaderIndexMapFromRow(
  values: (string | null)[],
  columns: ColumnDef[],
): Map<number, ColumnDef> {
  const norm = (h: string) => normalizeHeader(h).toUpperCase();
  const byHeader = new Map(columns.map((c) => [norm(c.excelHeader), c]));
  const map = new Map<number, ColumnDef>();
  values.forEach((v, index) => {
    if (!v) return;
    const colDef = byHeader.get(norm(v));
    if (colDef) map.set(index, colDef);
  });
  return map;
}

export function rowValuesToRecord(
  values: (string | null)[],
  headerIndexMap: Map<number, ColumnDef>,
  meta: {
    sourceFileName: string;
    uploadedById: string;
    uploadBatchId: string;
  },
): Record<string, unknown> {
  const record: Record<string, unknown> = {
    sourceFileName: meta.sourceFileName,
    uploadedById: meta.uploadedById,
    uploadBatchId: meta.uploadBatchId,
  };

  for (const [index, colDef] of headerIndexMap) {
    record[colDef.prismaField] = coerceValue(values[index] ?? null, colDef.type);
  }

  return record;
}

export function displayHeaders(target: UploadTargetType): string[] {
  return columnsForTarget(target).map((c) => c.excelHeader);
}
