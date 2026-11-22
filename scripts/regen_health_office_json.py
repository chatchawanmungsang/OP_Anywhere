"""Regenerate prisma/reference-data/health_office.json including แผนก/กรม."""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
XLSX = Path(r"E:\Orange_AI_Project\health_office.xlsx")
OUT = ROOT / "prisma" / "reference-data" / "health_office.json"


def clean(v: object) -> str:
    if v is None:
        return ""
    s = str(v).strip()
    m = re.match(r'^="?(.*?)"?$', s)
    if m:
        s = m.group(1)
    return s.strip()


def main() -> None:
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = ws.iter_rows(values_only=True)
    header = list(next(rows))
    idx = {name: i for i, name in enumerate(header)}

    out = []
    moph_depts: Counter[str] = Counter()
    for r in rows:
        code_raw = clean(r[idx["รหัส 5 หลัก"]])
        if not code_raw:
            continue
        code = code_raw.zfill(5)
        aff = clean(r[idx["สังกัด"]])
        dept = clean(r[idx["แผนก/กรม"]])
        if aff == "กระทรวงสาธารณสุข":
            moph_depts[dept or "(ว่าง)"] += 1
        out.append(
            {
                "hcode": code,
                "name": clean(r[idx["ชื่อ"]]),
                "orgType": clean(r[idx["ประเภทองค์กร"]]),
                "unitType": clean(r[idx["ประเภทหน่วยบริการสุขภาพ"]]),
                "affiliation": aff,
                "department": dept,
                "hospLevel": clean(r[idx["ระดับโรงพยาบาล"]]),
                "activeStatus": clean(r[idx["สถานะการใช้งาน"]]),
                "provinceCode": clean(r[idx["รหัสจังหวัด"]]),
                "provinceName": clean(r[idx["จังหวัด"]]),
                "amphurCode": clean(r[idx["รหัสอำเภอ"]]),
            }
        )

    OUT.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(out)} rows -> {OUT}")
    print(f"MOPH departments: {len(moph_depts)}")
    for k, v in moph_depts.most_common(20):
        print(f"  {v:5d}  {k}")


if __name__ == "__main__":
    main()
