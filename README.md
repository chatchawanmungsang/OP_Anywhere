# OP Anywhere

ระบบเว็บสำหรับนำเข้าและสรุปข้อมูล e-Claim (ไฟล์ Excel SUM / DETAIL) เข้า PostgreSQL  
รองรับรายงานสาธารณะ แดชบอร์ดรายเดือน และการจัดการสิทธิ์ตามบทบาทผู้ใช้

## อัปเดตฟีเจอร์ล่าสุด

### รายงานสาธารณะและแดชบอร์ด
- **หน้าแรก (`/`)** — แดชบอร์ดสรุปรายเดือน: การ์ด Visit / ค่าบริการ / จำนวนหน่วย / เงินชดเชย พร้อมเปรียบเทียบเดือนก่อน (เพิ่ม–ลด %) และกราฟแยกงวด / แนวโน้ม
- **หน่วยที่รักษา (`/by-hcode`)** — ตารางสรุปแบบ crosstab ตาม HCODE แยกต้นสังกัด งวด 1 / งวด 2 / รวมเดือน (ย้ายจากหน้าแรก)
- **หน่วยประจำ (`/by-hmain`)** — สรุปตามหน่วยบริการประจำ (HMAIN2)
- **รายงานจ่าย (`/payment-monthly`)** — สรุป Visit / ค่าบริการ / เงินชดเชยรายเดือน
- ส่งออก **CSV / Excel** จากหน้ารายงานสาธารณะ (ชื่อไฟล์รูปแบบ `OP_{เดือน}_{ปี}`)
- กลุ่มต้นสังกัด **กระทรวงสาธารณสุข** แยกย่อยตามแผนก/กรม

### เมนูและการใช้งาน
- **เมนูเดียวกันทุกหน้า** (`AppNav`) — หน้าแรก / หน่วยที่รักษา / หน่วยประจำ / รายงานจ่าย และเมนูหลังเข้าสู่ระบบ
- ผู้เยี่ยมชมเห็นปุ่ม **เข้าสู่ระบบ** ด้านขวา; ผู้ล็อกอินเห็นชื่อ–บทบาท–หน่วย และ Sign out
- เลย์เอาต์เต็มความกว้าง จอสูงจำกัดตาม viewport ตารางเลื่อนภายในกรอบ sticky header

### สิทธิ์และ Summary
- **Admin เท่านั้น**: Upload / Remark / Users
- **Manager**: กำหนดหน่วยบริการ (HCODE) ตอนสร้างบัญชี; หน้า Summary ล็อกตัวกรองตามหน่วยของตัวเอง
- หน้า Summary: กรองเดือน / ต้นสังกัด / หน่วย; คลิก TRAN_ID เปิดมุมมองใบเสร็จรายการรักษา
- ตรวจซ้ำ TRAN_ID ตอนนำเข้า และแจ้งเตือนใน Summary เมื่อพบรายการซ้ำ
- ลบข้อมูลตามงวดได้ (Admin)

### โครงสร้างข้อมูล
- ผู้ใช้มีฟิลด์ `hcode` / `hname` (ผูกหน่วยบริการ)
- ข้อมูลหน่วยบริการอ้างอิงมีฟิลด์ `department` สำหรับจัดกลุ่มย่อย สธ.

---

## สแต็กเทคโนโลยี

- Next.js (App Router) + TypeScript + Tailwind CSS
- PostgreSQL + Prisma
- Auth.js (NextAuth v5) — เข้าสู่ระบบด้วยอีเมล/รหัสผ่าน
- อ่านไฟล์ XLSX แบบสตรีม (ZIP + Sheet XML) รองรับไฟล์ใหญ่ถึง 500MB
- Docker Compose: บริการ `web` / `worker` / `postgres`

## พอร์ตเริ่มต้น (Docker)

| บริการ | พอร์ตโฮสต์ |
|---|---|
| เว็บแอป | **3010** → 3000 |
| PostgreSQL | **5434** → 5432 |

เปิดใช้งานที่ [http://localhost:3010](http://localhost:3010)

## เส้นทาง (Routes)

| เส้นทาง | คำอธิบาย | ต้องล็อกอิน |
|---|---|---|
| `/` | แดชบอร์ดสรุปรายเดือน | ไม่ |
| `/by-hcode` | สรุปตามหน่วยที่รักษา | ไม่ |
| `/by-hmain` | สรุปตามหน่วยบริการประจำ | ไม่ |
| `/payment-monthly` | รายงานการจ่ายรายเดือน | ไม่ |
| `/summary` | ตาราง Summary (ค้นหา/กรอง) | ใช่ |
| `/detail` | มุมมองรายละเอียด / ใบเสร็จจาก TRAN_ID | ใช่ |
| `/remark` | งาน Remark | Admin |
| `/upload` | อัปโหลด Excel SUM/DETAIL | Admin |
| `/users` | จัดการผู้ใช้ | Admin |
| `/login` | เข้าสู่ระบบ | — |

## บทบาทผู้ใช้ (Roles)

| ความสามารถ | Admin | Manager | User |
|---|---|---|---|
| ดูรายงานสาธารณะ / แดชบอร์ด | ใช่ | ใช่ | ใช่ |
| ดู Summary | ใช่ | ใช่ (ล็อกหน่วยตัวเอง) | ใช่ |
| Upload / Remark / Users | ใช่ | ไม่ | ไม่ |
| ลบข้อมูลตามงวด | ใช่ | ไม่ | ไม่ |
| มีหน่วยบริการ (HCODE) ผูกบัญชี | ได้ | **ต้องมี** | ได้ |

### ผู้ดูแลระบบเริ่มต้น (หลัง seed)

- อีเมล: `admin@example.com`
- รหัสผ่าน: `admin123`

## ตารางข้อมูลจาก Excel

| ไฟล์ SQL | ตาราง PostgreSQL | ไฟล์ Excel |
|---|---|---|
| `SQL-code-for-summary-table.sql` | `eclaim_transaction_summary` | `*SUM*.xlsx` |
| `SQL-code-for-detail-table.sql` | `eclaim_transaction_data` | `*DETAIL*.xlsx` |

- **SUM**: Sheet 1 เท่านั้น
- **DETAIL**: Sheet 1 + Sheet 2 (หัวตารางเดียวกัน รวมเป็นตารางเดียว)
- หัวคอลัมน์ต้องตรงกับสคีมา SQL
- กรอง **PROV1 + PROV2** ตอนนำเข้า — นำเข้าเฉพาะแถวที่ตรงเงื่อนไข

## การติดตั้งและรัน

### 1) เตรียม environment

```bash
cp .env.example .env
```

### 2) รันด้วย Docker (แนะนำ)

```bash
docker compose up -d --build
```

จะได้บริการ:

- `op-anywhere-web` — เว็บ + migrate + seed ตอนสตาร์ท
- `op-anywhere-worker` — ดึงงานนำเข้าตามรอบ
- `op-anywhere-db` — PostgreSQL

### 3) รันแบบพัฒนา (local)

ต้องมี Postgres ทำงานอยู่ (เช่น จาก Docker เฉพาะ db) แล้ว:

```bash
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

โดยปกติ dev server อยู่ที่พอร์ต 3000; ถ้าใช้ Compose ทั้งชุดให้เปิดที่พอร์ต **3010**

## กฎการอัปโหลด

- ชื่อไฟล์ต้องมี `SUM` หรือ `DETAIL` (ห้ามมีทั้งสองคำ)
- เฉพาะ `.xlsx` ขนาดสูงสุด **500MB**
- ฟอร์มต้องระบุ: **ปี พ.ศ.**, **เดือน**, **งวด (1/2)**, **PROV1**, **PROV2**
- รองรับโหมดอัปโหลดทันทีหรือตั้งคิวนำเข้าตามกำหนด
- ไฟล์ต้นฉบับเก็บที่ `data/archive/{year}/{month}/period-{n}/`
- รูปแบบชื่อ `_*6809_01.xlsx` ช่วยเติมปี 2568 เดือน 9 งวด 1 อัตโนมัติ
- ตรวจไฟล์/งวดซ้ำก่อนนำเข้า และแจ้ง TRAN_ID ซ้ำใน Summary

## Worker นำเข้าตามกำหนด

อัปโหลดสร้างงานสถานะ `SCHEDULED` → worker ประมวลผลเป็น `PROCESSING` → `SUCCESS` / `FAILED`

```bash
npm run worker:import
```

ใน Docker บริการ `worker` จะโพลงานให้อัตโนมัติ

ตัวแปรสภาพแวดล้อมที่เกี่ยวข้อง:

```env
IMPORT_SCHEDULE_HOUR=0
IMPORT_SCHEDULE_MINUTE=0
UPLOAD_ARCHIVE_DIR=./data/archive
WORKER_BATCH_SIZE=500
WORKER_MAX_JOBS_PER_RUN=1
WORKER_POLL_INTERVAL_SECONDS=10
```

## สคริปต์ที่มีประโยชน์

| คำสั่ง | คำอธิบาย |
|---|---|
| `npm run dev` | เซิร์ฟเวอร์พัฒนา |
| `npm run build` | บิลด์ production |
| `npm run db:migrate` | Prisma migrate (dev) |
| `npm run db:seed` | ใส่ข้อมูลเริ่มต้น (admin + หน่วยบริการ) |
| `npm run worker:import` | ประมวลผลงานอัปโหลดที่ครบกำหนด |
| `npm run prune` | CLI กรองไฟล์ Excel ใน `OP_Data` ตาม PROV / SUB_FUND / SUMS_COST |

## Excel Prune (CLI บนเครื่อง)

กรองไฟล์ SUM/DETAIL ใน `OP_Data` ให้เหลือแถวที่ **PROV1/PROV2** ตรงเงื่อนไข (ค่าเริ่มต้น `4000`), **SUB_FUND** มี `WALKIN`, และ **SUMS_COST** เป็น `0`:

```powershell
npm run prune
```

ถ้า PowerShell บล็อกสคริปต์:

```powershell
npm.cmd run prune
```

หรือ

```powershell
.\prune.cmd
```

- ต้นทาง: `OP_Data/*.xlsx`
- ผลลัพธ์: `OP_Data/Pruned/{ชื่อเดิม}Prune.xlsx`
- สถานะ: `OP_Data/.prune-state.json`
- อ่าน/เขียนแบบสตรีม ใช้ RAM น้อยแม้ไฟล์ใหญ่
- หยุดพักอัตโนมัติหลัง 60 นาทีต่อรอบ (`PRUNE_MAX_MS`) และรองรับ resume

ตัวแปรเสริม: `OP_DATA_DIR`, `PRUNE_PROV1`, `PRUNE_PROV2`, `PRUNE_SUB_FUND_CONTAINS`, `PRUNE_SUMS_COST`, `PRUNE_TMP_DIR`, `PRUNE_MAX_MS`

## โครงสร้างโปรเจกต์โดยย่อ

```
OP_Anywhere/
├── prisma/                 # schema, migrations, seed, ข้อมูลอ้างอิงหน่วยบริการ
├── src/
│   ├── app/                # หน้าและ API routes
│   ├── components/         # UI (แดชบอร์ด, รายงาน, เมนู, Summary)
│   └── lib/                # สถิติสาธารณะ, สิทธิ์, บริการนำเข้า
├── scripts/                # worker, prune, ยูทิลิตี้
├── data/                   # archive ไฟล์อัปโหลด (ไม่ commit)
├── OP_Data/                # ไฟล์ Excel สำหรับ prune (ไม่ commit)
├── docker-compose.yml
└── Dockerfile
```

## คลังโค้ด

- GitHub: [chatchawanmungsang/OP_Anywhere](https://github.com/chatchawanmungsang/OP_Anywhere)
