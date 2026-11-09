import { colRefToIndex, normalizeHeaderName } from "./xlsx-stream-core";

export type ProvColumnFilter = {
  prov1Col: string;
  prov2Col: string;
  subFundCol: string;
  sumsCostCol: string;
  filterProv1: string;
  filterProv2: string;
  filterSubFundContains: string;
  filterSumsCostEquals: number;
};

const CELL_RE = /<c([^>]*)>([\s\S]*?)<\/c>/g;

function cellRefColumn(attrs: string): string | null {
  const m = attrs.match(/\br="([A-Z]+)\d+"/i);
  return m ? m[1].toUpperCase() : null;
}

function cellValueFromParts(
  attrs: string,
  inner: string,
  sharedStrings: string[],
): string | null {
  const vMatch = inner.match(/<v>([^<]*)<\/v>/);
  const tMatch = inner.match(/<t[^>]*>([^<]*)<\/t>/);
  if (vMatch) {
    if (/\bt="s"/.test(attrs)) {
      return sharedStrings[Number(vMatch[1])] ?? null;
    }
    return vMatch[1];
  }
  if (tMatch) return tMatch[1];
  return null;
}

function extractCellByColumn(
  rowXml: string,
  colLetter: string,
  sharedStrings: string[],
): string | null {
  const target = colLetter.toUpperCase();
  for (const cell of rowXml.matchAll(CELL_RE)) {
    const col = cellRefColumn(cell[1]);
    if (col !== target) continue;
    return cellValueFromParts(cell[1], cell[2], sharedStrings);
  }
  return null;
}

function parseNumericCell(value: string | null): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function rowUsesSharedStrings(rowXml: string): boolean {
  return /\bt="s"/.test(rowXml);
}

const MISSING_FILTER_COLS =
  "Sheet is missing PROV1, PROV2, SUB_FUND, or SUMS_COST column.";

/** Parse header row once → column letters for filter fields. */
export function buildProvColumnFilter(
  headerRowXml: string,
  sharedStrings: string[],
  filterProv1: string,
  filterProv2: string,
  filterSubFundContains: string,
  filterSumsCostEquals: number,
): ProvColumnFilter {
  let prov1Col: string | null = null;
  let prov2Col: string | null = null;
  let subFundCol: string | null = null;
  let sumsCostCol: string | null = null;

  for (const cell of headerRowXml.matchAll(CELL_RE)) {
    const col = cellRefColumn(cell[1]);
    if (!col) continue;
    const value = cellValueFromParts(cell[1], cell[2], sharedStrings);
    if (value == null || value === "") continue;
    const norm = normalizeHeaderName(value).toUpperCase();
    if (norm === "PROV1") prov1Col = col;
    if (norm === "PROV2") prov2Col = col;
    if (norm === "SUB_FUND") subFundCol = col;
    if (norm === "SUMS_COST") sumsCostCol = col;
  }

  if (!prov1Col || !prov2Col || !subFundCol || !sumsCostCol) {
    throw new Error(MISSING_FILTER_COLS);
  }

  return {
    prov1Col,
    prov2Col,
    subFundCol,
    sumsCostCol,
    filterProv1: filterProv1.trim(),
    filterProv2: filterProv2.trim(),
    filterSubFundContains: filterSubFundContains.trim(),
    filterSumsCostEquals: filterSumsCostEquals,
  };
}

/** Like buildProvColumnFilter but returns null when the row is not a filter header row. */
export function tryBuildProvColumnFilter(
  headerRowXml: string,
  sharedStrings: string[],
  filterProv1: string,
  filterProv2: string,
  filterSubFundContains = "WALKIN",
  filterSumsCostEquals = 0,
): ProvColumnFilter | null {
  try {
    return buildProvColumnFilter(
      headerRowXml,
      sharedStrings,
      filterProv1,
      filterProv2,
      filterSubFundContains,
      filterSumsCostEquals,
    );
  } catch {
    return null;
  }
}

/** Fast filter — reads only PROV1 + PROV2 cells, not the full row. */
export function readProvValuesFromRow(
  rowXml: string,
  prov1Col: string,
  prov2Col: string,
  sharedStrings: string[],
): { prov1: string; prov2: string } {
  return {
    prov1: (extractCellByColumn(rowXml, prov1Col, sharedStrings) ?? "").trim(),
    prov2: (extractCellByColumn(rowXml, prov2Col, sharedStrings) ?? "").trim(),
  };
}

/** Fast filter — reads only the cells needed for PROV / SUB_FUND / SUMS_COST. */
export function rowMatchesProvFast(
  rowXml: string,
  filter: ProvColumnFilter,
  sharedStrings: string[],
): boolean {
  const prov1 = (
    extractCellByColumn(rowXml, filter.prov1Col, sharedStrings) ?? ""
  ).trim();
  const prov2 = (
    extractCellByColumn(rowXml, filter.prov2Col, sharedStrings) ?? ""
  ).trim();
  if (prov1 !== filter.filterProv1 || prov2 !== filter.filterProv2) {
    return false;
  }

  const subFund = (
    extractCellByColumn(rowXml, filter.subFundCol, sharedStrings) ?? ""
  ).trim();
  const needle = filter.filterSubFundContains;
  if (
    needle !== "" &&
    !subFund.toUpperCase().includes(needle.toUpperCase())
  ) {
    return false;
  }

  const sumsCost = parseNumericCell(
    extractCellByColumn(rowXml, filter.sumsCostCol, sharedStrings),
  );
  if (sumsCost !== filter.filterSumsCostEquals) {
    return false;
  }

  return true;
}

export function headerRowHasData(headerRowXml: string): boolean {
  return /<c[^>]*>/.test(headerRowXml);
}

export function provFilterFromColumns(
  prov1Col: string,
  prov2Col: string,
  subFundCol: string,
  sumsCostCol: string,
  filterProv1: string,
  filterProv2: string,
  filterSubFundContains: string,
  filterSumsCostEquals: number,
): ProvColumnFilter {
  return {
    prov1Col,
    prov2Col,
    subFundCol,
    sumsCostCol,
    filterProv1: filterProv1.trim(),
    filterProv2: filterProv2.trim(),
    filterSubFundContains: filterSubFundContains.trim(),
    filterSumsCostEquals: filterSumsCostEquals,
  };
}

export { colRefToIndex };
