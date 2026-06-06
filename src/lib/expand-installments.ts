// Detect installment markers like "03/12", "(03/12)", "3 de 12", "Parcela 3/12"
// inside a transaction description, and return future-installment expansion data.
//
// Usage: pass the parsed PDF rows. For every row whose description matches a
// recognized pattern, a stable installment_group_id is assigned and the missing
// future installments (current+1 .. total) are appended with monthly +1 dates.

export type InstallmentInputRow = {
  date: string; // YYYY-MM-DD
  name: string;
  amount: number;
  type: "expense" | "income";
  confidence_score?: number;
  original_amount_text?: string;
};

export type InstallmentExpandedRow = InstallmentInputRow & {
  installment_group_id: string | null;
  installment_number: number;
  total_installments: number;
};

// Patterns we accept inside the description.
// We deliberately keep them conservative to avoid false positives like dates ("12/03").
const PATTERNS: RegExp[] = [
  // "(3/12)" or "3/12" with leading separator (space, dash, "-", "x")
  /(?:^|[\s\-x(])(\d{1,2})\s*\/\s*(\d{1,2})(?=[\s)]|$)/,
  // "3 de 12"
  /(\d{1,2})\s*de\s*(\d{1,2})/i,
  // "Parcela 3 de 12" or "Parc 3/12"
  /parc(?:ela)?\.?\s*(\d{1,2})\s*[\/de]+\s*(\d{1,2})/i,
];

function detectInstallment(name: string): { current: number; total: number; matchIndex: number; matchLength: number } | null {
  for (const re of PATTERNS) {
    const m = name.match(re);
    if (!m) continue;
    const current = Number(m[1]);
    const total = Number(m[2]);
    if (!isFinite(current) || !isFinite(total)) continue;
    if (total < 2 || total > 60) continue; // sanity: 2..60 parcelas
    if (current < 1 || current > total) continue;
    return {
      current,
      total,
      matchIndex: m.index ?? 0,
      matchLength: m[0].length,
    };
  }
  return null;
}

function baseDescription(name: string): string {
  // Remove any "(x/y)", "x/y", "x de y" markers to get a clean base description.
  let cleaned = name;
  for (const re of PATTERNS) {
    cleaned = cleaned.replace(new RegExp(re.source, re.flags.includes("i") ? "gi" : "g"), " ");
  }
  return cleaned.replace(/\(\s*\)/g, "").replace(/\s+/g, " ").trim();
}

function addMonths(isoDate: string, months: number): string {
  // isoDate: YYYY-MM-DD. Avoid timezone surprises by using UTC math.
  const [yStr, mStr, dStr] = isoDate.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!y || !m || !d) return isoDate;
  const date = new Date(Date.UTC(y, m - 1 + months, 1));
  // clamp day to last day of resulting month
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Use crypto.randomUUID when available, otherwise a small fallback.
function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type ExpandResult = {
  rows: InstallmentExpandedRow[];
  detectedGroups: number; // distinct installment series detected
  futureRowsAdded: number; // how many extra rows we appended
};

/**
 * Expand installments in a list of parsed PDF rows.
 * - Rows without installment markers stay as-is (installment_group_id=null, number=1, total=1).
 * - Rows with markers (e.g. "Loja X 3/12") get a shared installment_group_id, and the
 *   missing future parcelas (current+1..total) are appended monthly.
 * - Existing parcelas already present in the same PDF (same base name + same total) are
 *   recognized as the same series, so we don't duplicate them.
 */
export function expandInstallments(input: InstallmentInputRow[]): ExpandResult {
  const out: InstallmentExpandedRow[] = [];
  // Map: seriesKey -> { groupId, total, anchorDate, anchorInstallment, baseName, presentNumbers:Set<number> }
  const series = new Map<
    string,
    {
      groupId: string;
      total: number;
      anchorDate: string;
      anchorInstallment: number;
      baseName: string;
      type: "expense" | "income";
      amount: number;
      presentNumbers: Set<number>;
      confidence_score: number;
      original_amount_text?: string;
    }
  >();

  // First pass: emit existing rows, marking installments and registering series.
  for (const r of input) {
    const det = detectInstallment(r.name);
    if (!det) {
      out.push({
        ...r,
        installment_group_id: null,
        installment_number: 1,
        total_installments: 1,
        confidence_score: r.confidence_score ?? 100,
        original_amount_text: r.original_amount_text,
      });
      continue;
    }
    const base = baseDescription(r.name) || r.name;
    const seriesKey = `${base.toLowerCase()}|${det.total}|${r.amount.toFixed(2)}|${r.type}`;
    let s = series.get(seriesKey);
    if (!s) {
      s = {
        groupId: uuid(),
        total: det.total,
        anchorDate: r.date,
        anchorInstallment: det.current,
        baseName: base,
        type: r.type,
        amount: r.amount,
        presentNumbers: new Set<number>(),
        confidence_score: r.confidence_score ?? 100,
        original_amount_text: r.original_amount_text,
      };
      series.set(seriesKey, s);
    } else {
      // Keep earliest anchor so future-date math is consistent.
      if (det.current < s.anchorInstallment) {
        s.anchorInstallment = det.current;
        s.anchorDate = r.date;
      }
    }
    s.presentNumbers.add(det.current);

    out.push({
      date: r.date,
      name: `${base} (${det.current}/${det.total})`,
      amount: r.amount,
      type: r.type,
      installment_group_id: s.groupId,
      installment_number: det.current,
      total_installments: det.total,
      confidence_score: s.confidence_score,
      original_amount_text: s.original_amount_text,
    });
  }

  // Second pass: append missing future installments per series.
  let futureRowsAdded = 0;
  for (const s of series.values()) {
    for (let n = s.anchorInstallment + 1; n <= s.total; n++) {
      if (s.presentNumbers.has(n)) continue;
      const monthsAhead = n - s.anchorInstallment;
      const futureDate = addMonths(s.anchorDate, monthsAhead);
      out.push({
        date: futureDate,
        name: `${s.baseName} (${n}/${s.total})`,
        amount: s.amount,
        type: s.type,
        installment_group_id: s.groupId,
        installment_number: n,
        total_installments: s.total,
        confidence_score: s.confidence_score,
        original_amount_text: s.original_amount_text,
      });
      s.presentNumbers.add(n);
      futureRowsAdded++;
    }
  }

  // Sort: by date ascending, then by installment_number for stable ordering.
  out.sort((a, b) => {
    if (a.date === b.date) return a.installment_number - b.installment_number;
    return a.date.localeCompare(b.date);
  });

  return {
    rows: out,
    detectedGroups: series.size,
    futureRowsAdded,
  };
}
