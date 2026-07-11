
export type CardTransaction = {
  id: string;
  name: string;
  icon: string | null;
  category: string;
  card?: string | null;
  date: string;
  amount: number;
  type: string;
  created_at: string;
  total_installments: number | null;
  installment_number: number | null;
  installment_group_id: string | null;
};

export type InvoicePeriod = {
  label: string;
  key: string;
  startDate: Date;
  endDate: Date;
  dueDate: Date;
  transactions: CardTransaction[];
  total: number;
};

export const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export const shortMonthMap: Record<string, number> = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};

const longMonthMap: Record<string, number> = {
  janeiro: 0, fevereiro: 1, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};

/**
 * Normalizes a Portuguese month token so that pontuação, acentos e
 * capitalização não impeçam o reconhecimento. Ex.: "Março" → "marco",
 * "fev." → "fev", "Setembro" → "setembro".
 */
function normalizeMonthToken(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[.,;:]+$/g, "")         // strip trailing pontuação
    .replace(/[^a-z]/g, "");          // drop any remaining non-letters
}

function resolveMonthIdx(token: string): number | undefined {
  const norm = normalizeMonthToken(token);
  if (norm === "") return undefined;
  if (norm in shortMonthMap) return shortMonthMap[norm];
  if (norm in longMonthMap) return longMonthMap[norm];
  // Long names that start with a known short abbreviation (e.g. "janeiro" → "jan")
  // fall through to shortMonthMap. Keep as an explicit fallback so unrelated
  // words like "janela" are NOT accepted.
  const prefix = norm.slice(0, 3);
  if (norm.length > 3 && prefix in shortMonthMap && longMonthMap[norm] !== undefined) {
    return shortMonthMap[prefix];
  }
  return undefined;
}

export function parseTxDate(dateStr: string, fallback: string): Date {
  // Sanitize noisy inputs: strip zero-width / invisible unicode that would
  // otherwise split tokens, and drop stray pontuação that gets attached to
  // digits or month words (e.g. "01!", "10,/07", "jan..."). Keep "/" and
  // "-" so numeric separators survive.
  const rawCleaned = (dateStr || "")
    .replace(/[\u200B-\u200D\uFEFF\u180E\u2028\u2029\u00A0\u202F\u205F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // For token-based parsing we drop pontuação and collapse space-wrapped
  // dashes (e.g. "01 - jan") into a single space. For the native ISO
  // fallback further below we keep colons/dots so `new Date(...)` can still
  // read timestamps like "2026-07-10T12:00:00Z".
  const cleaned = rawCleaned
    .replace(/\s-\s/g, " ")
    .replace(/[.,;:!?]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // Drop lone punctuation-only tokens (e.g. a trailing "-") that survive
  // sanitization when they were space-separated in the original string.
  const parts = cleaned.toLowerCase().split(/\s+/).filter((t) => /[a-z0-9]/.test(t));
  const fallbackDate = new Date(fallback);
  const hasFallback = !isNaN(fallbackDate.getTime());
  const fallbackYear = hasFallback ? fallbackDate.getFullYear() : new Date().getFullYear();
  const fallbackMonth = hasFallback ? fallbackDate.getMonth() : new Date().getMonth();

  if (parts.length === 2) {
    const day = parseInt(parts[0]);
    const dayLooksNumeric = /^-?\d+(\.\d+)?$/.test(parts[0]);
    const monthIdx = resolveMonthIdx(parts[1]);
    if (!isNaN(day) && monthIdx !== undefined) {
      // Year-boundary disambiguation: the textual `date` carries no year,
      // so we infer it from `created_at`. Near the Dec↔Jan boundary the
      // raw fallback year can be off by one — e.g. a tx typed as "02 jan"
      // whose row was created moments earlier at 2025-12-31T23:59:00Z
      // would otherwise be placed in Jan 2025, dragging the tx into the
      // previous year's billing cycle. Shift the year when the textual
      // month is ≥10 months away from the fallback month.
      let year = fallbackYear;
      if (monthIdx === 0 && fallbackMonth >= 10) year = fallbackYear + 1;   // jan tx, created in Nov/Dec → next year
      else if (monthIdx === 11 && fallbackMonth <= 1) year = fallbackYear - 1; // dez tx, created in Jan/Fev → previous year
      return new Date(year, monthIdx, day);
    }
    // "DD <not-a-month>" (e.g. "07 marte", "07 janela"): the input claims to
    // be a "day + month" pair but the second token is not a Portuguese month.
    // Skip the native `new Date(dateStr)` parser (V8 is too lenient here —
    // "07 janela" gets read as Jan 7) and go straight to the fallback.
    if (dayLooksNumeric) {
      return hasFallback ? fallbackDate : new Date();
    }
  }

  // Numeric textual dates with separators "/" or "-".
  // pt-BR convention is DD/MM[/YYYY]; ISO is YYYY-MM-DD. We detect ISO by a
  // 4-digit leading segment; everything else is treated as day-first so that
  // "10/07", "10-07", "10/07/2026" and "10-07-2026" all resolve to the same
  // day/month (and, for 2-part inputs, the same billing cycle as "10 jul").
  const numericParts = cleaned.split(/\s*[\/\-]\s*/);
  if (
    (numericParts.length === 2 || numericParts.length === 3) &&
    numericParts.every((p) => /^\d+$/.test(p))
  ) {
    let day: number, monthIdx: number, year: number | undefined;
    if (numericParts[0].length === 4 && numericParts.length === 3) {
      // ISO-like YYYY-MM-DD
      year = parseInt(numericParts[0]);
      monthIdx = parseInt(numericParts[1]) - 1;
      day = parseInt(numericParts[2]);
    } else {
      // DD/MM or DD/MM/YYYY (pt-BR)
      day = parseInt(numericParts[0]);
      monthIdx = parseInt(numericParts[1]) - 1;
      if (numericParts.length === 3) {
        const y = parseInt(numericParts[2]);
        year = y < 100 ? 2000 + y : y;
      }
    }
    const validDay = day >= 1 && day <= 31;
    const validMonth = monthIdx >= 0 && monthIdx <= 11;
    if (validDay && validMonth) {
      if (year === undefined) {
        year = fallbackYear;
        if (monthIdx === 0 && fallbackMonth >= 10) year = fallbackYear + 1;
        else if (monthIdx === 11 && fallbackMonth <= 1) year = fallbackYear - 1;
      }
      return new Date(year, monthIdx, day);
    }
    return hasFallback ? fallbackDate : new Date();
  }

  const d = new Date(rawCleaned || dateStr);
  return isNaN(d.getTime()) ? (hasFallback ? fallbackDate : new Date()) : d;
}



export function getCycleDates(referenceDate: Date, closingDay: number, dueDay: number) {
  const cDay = closingDay || 1;
  const dDay = dueDay || 10;
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();

  const makeDue = (closing: Date) => {
    const d = new Date(closing.getFullYear(), closing.getMonth(), dDay);
    if (d <= closing) d.setMonth(d.getMonth() + 1);
    return d;
  };

  // "Current" invoice is the one whose due date falls in the current
  // calendar month — regardless of whether it's unpaid, partially paid or
  // fully paid. It only rolls forward when the calendar month changes.
  const currentClose = new Date(year, month, cDay);
  const currentDue = makeDue(currentClose);

  const prevClose = new Date(currentClose.getFullYear(), currentClose.getMonth() - 1, cDay);
  return { currentClose, currentDue, prevClose, makeDue };
}

export function groupByBillingCycle(txs: CardTransaction[], closingDay: number | null, dueDay: number | null, referenceDate: Date = new Date()): InvoicePeriod[] {
  const cDay = closingDay || 1;
  const dDay = dueDay || 10;
  const { currentClose: closingDate, prevClose: prevClosing, makeDue } = getCycleDates(referenceDate, closingDay || 1, dueDay || 10);
  const pastClosing = new Date(prevClosing.getFullYear(), prevClosing.getMonth() - 1, cDay);

  // Find the max future date from all transactions based on their actual date field
  let maxFutureDate = new Date();
  for (const tx of txs) {
    const txDate = parseTxDate(tx.date, tx.created_at);
    if (txDate > maxFutureDate) maxFutureDate = txDate;
  }

  const formatLabel = (prefix: string, endDate: Date) => {
    const dueDate = makeDue(endDate);
    return `${prefix} (F ${endDate.getDate().toString().padStart(2, '0')}/${(endDate.getMonth() + 1).toString().padStart(2, '0')} e V ${dueDate.getDate().toString().padStart(2, '0')}/${(dueDate.getMonth() + 1).toString().padStart(2, '0')})|${endDate.toISOString().split("T")[0]}`;
  };

  const periods: InvoicePeriod[] = [
    { label: formatLabel("Anterior", prevClosing), key: "past", startDate: pastClosing, endDate: prevClosing, dueDate: makeDue(prevClosing), transactions: [], total: 0 },
    { label: formatLabel("Atual", closingDate), key: "current", startDate: prevClosing, endDate: closingDate, dueDate: makeDue(closingDate), transactions: [], total: 0 },
  ];

  let futureStart = new Date(closingDate);
  let futureIndex = 0;
  while (futureStart < maxFutureDate || futureIndex === 0) {
    const futureEnd = new Date(futureStart.getFullYear(), futureStart.getMonth() + 1, cDay);
    periods.push({
      label: formatLabel("Próxima", futureEnd),
      key: `future_${futureIndex}`,
      startDate: new Date(futureStart),
      endDate: futureEnd,
      dueDate: makeDue(futureEnd),
      transactions: [],
      total: 0,
    });
    futureStart = futureEnd;
    futureIndex++;
    if (futureIndex > 24) break;
  }

  // Place each transaction in the correct period based on its DATE field
  for (const tx of txs) {
    const txDate = parseTxDate(tx.date, tx.created_at);

    let periodIdx = -1;
    for (let pi = 0; pi < periods.length; pi++) {
      if (txDate >= periods[pi].startDate && txDate < periods[pi].endDate) {
        periodIdx = pi;
        break;
      }
    }
    if (periodIdx === -1) continue;

    periods[periodIdx].transactions.push(tx);
    if (tx.type === "income") {
      periods[periodIdx].total -= Number(tx.amount);
    } else {
      periods[periodIdx].total += Number(tx.amount);
    }
  }

  return periods.filter((p, i) => i < 2 || p.transactions.length > 0);
}
