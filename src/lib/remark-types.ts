export type BuilderOperator =
  | "EQ"
  | "NEQ"
  | "CONTAINS"
  | "NOT_CONTAINS"
  | "STARTS_WITH"
  | "IN"
  | "NOT_IN"
  | "GT"
  | "GTE"
  | "LT"
  | "LTE";

export type BuilderCondition = {
  field: string;
  operator: BuilderOperator;
  value: string;
};

export type BuilderFieldMeta = {
  key: string;
  label: string;
  kind: "string" | "number" | "boolean_yn";
  placeholder?: string;
};

export const REMARK_BUILDER_FIELDS: BuilderFieldMeta[] = [
  {
    key: "in_same_cup_network",
    label: "อยู่ในเครือข่าย CUP เดียวกับ HMAIN2 (Y/N)",
    kind: "boolean_yn",
    placeholder: "Y หรือ N",
  },
  {
    key: "is_hcode_eq_hmain2",
    label: "HCODE เป็นหน่วยเดียวกับ HMAIN2 (Y/N)",
    kind: "boolean_yn",
    placeholder: "Y หรือ N",
  },
  {
    key: "is_hcode_eq_hsub",
    label: "HCODE เป็นหน่วยเดียวกับ HSUB_AF (Y/N)",
    kind: "boolean_yn",
    placeholder: "Y หรือ N",
  },
  {
    key: "hcode",
    label: "HCODE (รหัสหน่วยบริการรักษา)",
    kind: "string",
    placeholder: "เช่น 10670, 04248",
  },
  {
    key: "hmain2",
    label: "HMAIN2 (รหัสหน่วยบริการประจำ)",
    kind: "string",
    placeholder: "เช่น 10670, 13777",
  },
  {
    key: "hsub_af",
    label: "HSUB_AF (รหัสหน่วยปฐมภูมิ)",
    kind: "string",
    placeholder: "เช่น 04248",
  },
  {
    key: "hcode_paid",
    label: "HCODE_PAID (หน่วย Master CUP)",
    kind: "string",
    placeholder: "เช่น 10670, 11000",
  },
  {
    key: "htype",
    label: "HTYPE (ประเภทหน่วยบริการรักษา)",
    kind: "string",
    placeholder: "เช่น สถานบริการสังกัดองค์กรปกครองส่วนท้องถิ่น(อปท.)",
  },
  {
    key: "hosp_level_prefix",
    label: "ระดับโรงพยาบาลจาก health_office (A, S, M1, M2, F1, F2, F3)",
    kind: "string",
    placeholder: "เช่น A,S หรือ F1,F2,F3",
  },
  {
    key: "ho_affiliation",
    label: "สังกัดหน่วยบริการจาก health_office",
    kind: "string",
    placeholder: "เช่น องค์กรปกครองส่วนท้องถิ่น, กระทรวงสาธารณสุข",
  },
  {
    key: "fund_af",
    label: "FUND_AF (รหัสกองทุน)",
    kind: "string",
    placeholder: "เช่น HC16 หรือ DM22,HC16",
  },
  {
    key: "sub_fund",
    label: "SUB_FUND (รหัสกองทุนย่อย)",
    kind: "string",
    placeholder: "เช่น HERB หรือ OPINST หรือ WALKIN_ONE-ID",
  },
  {
    key: "maininscl_af",
    label: "MAININSCL_AF (สิทธิหลัก WEL / UCS)",
    kind: "string",
    placeholder: "เช่น WEL หรือ UCS",
  },
  {
    key: "subinscl_af",
    label: "SUBINSCL_AF (สิทธิย่อย)",
    kind: "string",
    placeholder: "เช่น 71,72,77,89",
  },
  {
    key: "charge_cost",
    label: "CHARGE_COST (จำนวนเงินที่ขอเบิก)",
    kind: "number",
    placeholder: "เช่น 50",
  },
  {
    key: "sums_cost",
    label: "SUMS_COST (จำนวนเงินชดเชย)",
    kind: "number",
    placeholder: "เช่น 0",
  },
  {
    key: "send_delay_days",
    label: "ระยะเวลาส่งข้อมูลล่าช้าหลังวันรับบริการ (วัน)",
    kind: "number",
    placeholder: "เช่น 3 หรือ 8",
  },
  {
    key: "age_yy",
    label: "AGE_YY (อายุ ปี)",
    kind: "number",
    placeholder: "เช่น 60",
  },
  {
    key: "status_cardb",
    label: "STATUS_CARDB (รหัสตรวจสอบสิทธิ Card Base)",
    kind: "number",
    placeholder: "เช่น 4, 9, 11",
  },
  {
    key: "pdx",
    label: "PDX (รหัสโรคหลัก ICD-10)",
    kind: "string",
    placeholder: "เช่น Z480 หรือ J00",
  },
  {
    key: "aen",
    label: "AEN (A / E / N / -)",
    kind: "string",
    placeholder: "เช่น - หรือ N",
  },
  {
    key: "projectcode",
    label: "PROJECTCODE (รหัสโครงการพิเศษ)",
    kind: "string",
    placeholder: "เช่น WALKIN",
  },
  {
    key: "stmt_period",
    label: "STMT_PERIOD (รอบ Statement ย่อย)",
    kind: "string",
    placeholder: "เช่น 6908_OP_04 หรือ 99",
  },
  {
    key: "sev04",
    label: "SEV04 (ยอดเบิกค่ายา หมวด 4)",
    kind: "number",
    placeholder: "เช่น 0",
  },
  {
    key: "sev12",
    label: "SEV12 (ยอดเบิกค่าบริการผู้ป่วยนอก หมวด 12)",
    kind: "number",
    placeholder: "เช่น 40",
  },
];

export const REMARK_OPERATORS: { value: BuilderOperator; label: string }[] = [
  { value: "EQ", label: "= เท่ากับ" },
  { value: "NEQ", label: "!= ไม่เท่ากับ" },
  { value: "CONTAINS", label: "มีคำว่า (CONTAINS)" },
  { value: "NOT_CONTAINS", label: "ไม่มีคำว่า (NOT CONTAINS)" },
  { value: "STARTS_WITH", label: "ขึ้นต้นด้วย (STARTS WITH)" },
  { value: "IN", label: "อยู่ในชุดค่า (คั่นด้วย ,)" },
  { value: "NOT_IN", label: "ไม่อยู่ในชุดค่า (คั่นด้วย ,)" },
  { value: "GT", label: "> มากกว่า" },
  { value: "GTE", label: ">= มากกว่าหรือเท่ากับ" },
  { value: "LT", label: "< น้อยกว่า" },
  { value: "LTE", label: "<= น้อยกว่าหรือเท่ากับ" },
];
