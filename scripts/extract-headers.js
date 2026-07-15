const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const readline = require("readline");
const { createReadStream } = require("fs");

async function readFirstRowXml(sheetPath) {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(sheetPath, { encoding: "utf8" });
    let buf = "";
    let found = false;
    stream.on("data", (chunk) => {
      buf += chunk;
      const start = buf.indexOf("<row");
      if (start === -1) {
        // keep tail in case tag straddles chunks
        if (buf.length > 100000) buf = buf.slice(-1000);
        return;
      }
      const end = buf.indexOf("</row>", start);
      if (end !== -1) {
        found = true;
        stream.destroy();
        resolve(buf.slice(start, end + 6));
      }
      // safety: don't grow forever if malformed
      if (buf.length > 5_000_000) {
        stream.destroy();
        reject(new Error("First row XML too large"));
      }
    });
    stream.on("close", () => {
      if (!found) reject(new Error("No complete first row in " + sheetPath));
    });
    stream.on("error", reject);
  });
}

function parseSharedStrings(sharedPath) {
  const strings = [];
  if (!fs.existsSync(sharedPath)) return strings;
  const ss = fs.readFileSync(sharedPath, "utf8");
  const siBlocks = ss.match(/<si>[\s\S]*?<\/si>/g) || [];
  for (const block of siBlocks) {
    const parts = [...block.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((m) => m[1]);
    strings.push(parts.join(""));
  }
  return strings;
}

async function extractSheet1Headers(xlsxPath, workDir) {
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });
  const zipPath = path.join(workDir, "book.zip");
  fs.copyFileSync(xlsxPath, zipPath);

  // Extract only needed parts (sheet1 may be huge; tar still extracts full sheet1)
  execSync(
    `tar -xf book.zip xl/sharedStrings.xml xl/worksheets/sheet1.xml`,
    { cwd: workDir, stdio: "pipe", shell: true },
  );

  const sharedPath = path.join(workDir, "xl", "sharedStrings.xml");
  const sheetPath = path.join(workDir, "xl", "worksheets", "sheet1.xml");
  const strings = parseSharedStrings(sharedPath);
  const rowXml = await readFirstRowXml(sheetPath);
  const cells = [...rowXml.matchAll(/<c([^>]*)>(?:<v>([^<]*)<\/v>)?/g)];
  const headers = cells
    .map((c) => {
      const attrs = c[1];
      const v = c[2];
      const isShared = /\bt="s"/.test(attrs);
      if (v == null) return "";
      if (isShared) return strings[Number(v)] ?? "";
      return v;
    })
    .map((h) => String(h).trim())
    .filter(Boolean);

  return {
    file: path.basename(xlsxPath),
    headerCount: headers.length,
    headers,
  };
}

(async () => {
  const os = require("os");
  const sum = await extractSheet1Headers(
    "PROV1_PROV2_RG07_SUM_6809_01.xlsx",
    path.join(os.tmpdir(), "op-anywhere-xlsx-sum"),
  );
  console.log("SUM done", sum.headerCount);
  const detail = await extractSheet1Headers(
    "PROV1_PROV2_RG07_DETAIL_6809_01.xlsx",
    path.join(os.tmpdir(), "op-anywhere-xlsx-detail"),
  );
  console.log("DETAIL done", detail.headerCount);
  const out = { sum, detail };
  console.log(JSON.stringify(out, null, 2));
  fs.writeFileSync("excel-headers.json", JSON.stringify(out, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
