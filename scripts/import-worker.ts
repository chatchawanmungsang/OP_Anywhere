import { runImportWorker } from "../src/lib/import-job";

async function main() {
  console.log("[import-worker] Starting scheduled import run...");
  const result = await runImportWorker();
  console.log(
    `[import-worker] Done. processed=${result.processed} errors=${result.errors.length}`,
  );
  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.error(`[import-worker] ${err}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[import-worker] Fatal:", error);
  process.exit(1);
});
