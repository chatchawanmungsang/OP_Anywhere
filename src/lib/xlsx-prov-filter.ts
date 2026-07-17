import { colRefToIndex, normalizeHeaderName } from "./xlsx-stream-core";

export type ProvColumnFilter = {
  prov1Col: string;
  prov2Col: string;
  filterProv1: string;
  filterProv2: string;
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

export function rowUsesSharedStrings(rowXml: string): boolean {
  return /\bt="s"/.test(rowXml);
}

/** Parse header row once → column letters for PROV1 / PROV2. */
export function buildProvColumnFilter(
  headerRowXml: string,
  sharedStrings: string[],
  filterProv1: string,
  filterProv2: string,
): ProvColumnFilter {
  let prov1Col: string | null = null;
  let prov2Col: string | null = null;

  for (const cell of headerRowXml.matchAll(CELL_RE)) {
    const col = cellRefColumn(cell[1]);
    if (!col) continue;
    const value = cellValueFromParts(cell[1], cell[2], sharedStrings);
    if (value == null || value === "") continue;
    const norm = normalizeHeaderName(value).toUpperCase();
    if (norm === "PROV1") prov1Col = col;
    if (norm === "PROV2") prov2Col = col;
  }

  if (!prov1Col || !prov2Col) {
    throw new Error("Sheet is missing PROV1 or PROV2 column.");
  }

  return {
    prov1Col,
    prov2Col,
    filterProv1: filterProv1.trim(),
    filterProv2: filterProv2.trim(),
  };
}

/** Fast filter — reads only PROV1 + PROV2 cells, not the full row. */
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
  return prov1 === filter.filterProv1 && prov2 === filter.filterProv2;
}

export function headerRowHasData(headerRowXml: string): boolean {
  return /<c[^>]*>/.test(headerRowXml);
}

export function provFilterFromColumns(
  prov1Col: string,
  prov2Col: string,
  filterProv1: string,
  filterProv2: string,
): ProvColumnFilter {
  return {
    prov1Col,
    prov2Col,
    filterProv1: filterProv1.trim(),
    filterProv2: filterProv2.trim(),
  };
}

export { colRefToIndex };
