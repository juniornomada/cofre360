/**
 * Parse the existing deterministic Insights answer into a read-only, mobile report.
 * Do not infer financial values or periods from the conversation.
 * The original markdown remains stored in the chat history unchanged.
 */
export type InsightSubcategory = {
  name: string;
  beforeCents: number;
  afterCents: number;
  differenceCents: number;
};

export type InsightPurchase = {
  subcategory: string;
  name: string;
  amountCents: number;
};

export type InsightPurchasesByPeriod = {
  items: InsightPurchase[];
  totalCount: number | null;
};

export type InsightSubcategoryReport = {
  category: string;
  earlierLabel: string;
  laterLabel: string;
  earlierCents: number;
  laterCents: number;
  differenceCents: number;
  subcategories: InsightSubcategory[];
  earlierPurchases: InsightPurchasesByPeriod;
  laterPurchases: InsightPurchasesByPeriod;
  reconciled: boolean;
};

const MONTHS = "(?:Janeiro|Fevereiro|Março|Marco|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)";
const PERIOD = MONTHS + "\\/(?:19|20)\\d{2}";
const HEADER = new RegExp(
  "^###\\s+(.*?)\\s+por subcategoria\\s+[—–-]\\s+(" + PERIOD + ")\\s*[×x]\\s*(" + PERIOD + ")\\s*$",
  "m",
);

function cents(value: string): number | null {
  const match = value.trim().match(/^(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/);
  if (!match) return null;
  const whole = Number(match[1].replace(/\./g, ""));
  const amount = whole * 100 + Number(match[2]);
  return Number.isSafeInteger(amount) ? amount : null;
}

function periodTotals(content: string): Map<string, number> {
  const result = new Map<string, number>();
  const linePattern = /^-\s+([^:\n]+):\s+\*\*R\$\s*([\d.,]+)\*\*$/gm;
  for (const match of content.matchAll(linePattern)) {
    const amount = cents(match[2]);
    if (amount !== null) result.set(match[1].trim(), amount);
  }
  return result;
}

function extractPurchases(content: string, period: string): InsightPurchasesByPeriod {
  const startMarker = "#### Principais compras — " + period;
  const start = content.indexOf(startMarker);
  if (start < 0) return { items: [], totalCount: null };
  const tail = content.slice(start + startMarker.length);
  const end = tail.search(/\n(?:#### |>\s)/);
  const section = end >= 0 ? tail.slice(0, end) : tail;
  const items: InsightPurchase[] = [];
  for (const match of section.matchAll(/^-\s+\*\*(.+?)\*\*\s+·\s+(.+?)\s+[—–-]\s+R\$\s*([\d.,]+)$/gm)) {
    const amount = cents(match[3]);
    if (amount === null) continue;
    items.push({ subcategory: match[1].trim(), name: match[2].trim(), amountCents: amount });
  }
  const total = section.match(/_Exibindo as \d+ maiores de (\d+) compras em [^_\n]+_/);
  const totalCount = total ? Number(total[1]) : items.length;
  return { items, totalCount: Number.isSafeInteger(totalCount) ? totalCount : null };
}

export function isPotentialSubcategoryReport(content: string): boolean {
  return content.startsWith("### ") && content.includes(" por subcategoria — ") &&
    content.includes("#### Comparativo das subcategorias");
}

export function parseSubcategoryReport(content: string): InsightSubcategoryReport | null {
  if (!isPotentialSubcategoryReport(content)) return null;
  const header = content.match(HEADER);
  if (!header) return null;
  const category = header[1].replace(/^[^\p{L}\p{N}]+/u, "").trim();
  if (!category || category.length > 90) return null;
  const earlierLabel = header[2];
  const laterLabel = header[3];
  const breakdownStart = content.indexOf("#### Comparativo das subcategorias", header.index ?? 0);
  const purchasesStart = content.indexOf("#### Principais compras — ", breakdownStart);
  if (breakdownStart < 0 || purchasesStart < 0) return null;

  const totals = periodTotals(content.slice((header.index ?? 0) + header[0].length, breakdownStart));
  const earlierCents = totals.get(earlierLabel);
  const laterCents = totals.get(laterLabel);
  if (earlierCents === undefined || laterCents === undefined) return null;

  const rows = content.slice(breakdownStart, purchasesStart);
  const subcategories: InsightSubcategory[] = [];
  let deltasMatch = true;
  const rowPattern = /^-\s+\*\*(.+?)\*\*\s+[—–-]\s+([^:\n]+):\s+R\$\s*([\d.,]+)\s*→\s*([^:\n]+):\s+R\$\s*([\d.,]+)\s+\(\*\*([+-])R\$\s*([\d.,]+)\*\*\)$/gm;
  for (const match of rows.matchAll(rowPattern)) {
    if (match[2].trim() !== earlierLabel || match[4].trim() !== laterLabel) return null;
    const beforeCents = cents(match[3]);
    const afterCents = cents(match[5]);
    const reportedDelta = cents(match[7]);
    if (beforeCents === null || afterCents === null || reportedDelta === null) return null;
    const differenceCents = afterCents - beforeCents;
    if (differenceCents !== (match[6] === "-" ? -reportedDelta : reportedDelta)) deltasMatch = false;
    subcategories.push({ name: match[1].trim(), beforeCents, afterCents, differenceCents });
  }
  if (!subcategories.length) return null;
  const sumEarlier = subcategories.reduce((sum, row) => sum + row.beforeCents, 0);
  const sumLater = subcategories.reduce((sum, row) => sum + row.afterCents, 0);
  return {
    category,
    earlierLabel,
    laterLabel,
    earlierCents,
    laterCents,
    differenceCents: laterCents - earlierCents,
    subcategories,
    earlierPurchases: extractPurchases(content, earlierLabel),
    laterPurchases: extractPurchases(content, laterLabel),
    reconciled: deltasMatch && sumEarlier === earlierCents && sumLater === laterCents,
  };
}
