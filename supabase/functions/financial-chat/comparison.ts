// Comparações determinísticas devem preservar os períodos explícitos e os follow-ups.
// Este módulo não consulta nem modifica transações financeiras.
const MONTH_ALIASES = [
  ["janeiro", "jan"], ["fevereiro", "fev"], ["marco", "mar"],
  ["abril", "abr"], ["maio", "mai"], ["junho", "jun"],
  ["julho", "jul"], ["agosto", "ago"], ["setembro", "set"],
  ["outubro", "out"], ["novembro", "nov"], ["dezembro", "dez"],
] as const;

const fold = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

export type ComparisonSelection = {
  isComparison: true;
  byCategory: boolean;
  earlierKey: string | null;
  laterKey: string | null;
};

export function explicitComparisonMonths(question: string, referenceYear: number): [string, string] | null {
  const text = fold(question);
  const aliases = MONTH_ALIASES.flat().join("|");
  const named = new RegExp(`\\b(${aliases})\\b(?:\\s*(?:de|\\/|-)\\s*((?:19|20)\\d{2}))?`, "g");
  const matches: Array<{ month: number; year: number | null }> = [];

  for (const match of text.matchAll(named)) {
    const month = MONTH_ALIASES.findIndex((values) => values.some((alias) => alias === match[1])) + 1;
    if (month) matches.push({ month, year: match[2] ? Number(match[2]) : null });
  }

  // Aceitar "meses 09 e 10" e "09/2026 e 10/2026", sem confundir valores R$ com meses.
  if (matches.length === 0 && /\b(meses?|compar\w*|entre)\b/.test(text)) {
    const numeric = /\b(0?[1-9]|1[0-2])(?:\s*[/-]\s*((?:19|20)\d{2}))?\b/g;
    for (const match of text.matchAll(numeric)) {
      matches.push({ month: Number(match[1]), year: match[2] ? Number(match[2]) : null });
    }
  }

  if (matches.length < 2) return null;

  const explicitYears = new Set(matches.map((item) => item.year).filter((year): year is number => year !== null));
  const sharedYear = explicitYears.size === 1 ? [...explicitYears][0] : referenceYear;
  const keys = [...new Set(matches.map((item) => monthKey(item.year ?? sharedYear, item.month)))].sort();
  // Nunca inferir um par a partir de três ou mais períodos distintos.
  return keys.length === 2 ? [keys[0], keys[1]] : null;
}

export function resolveComparisonSelection(
  userQuestions: readonly string[],
  referenceYear: number,
): ComparisonSelection | null {
  const current = fold(userQuestions[userQuestions.length - 1] || "").trim();
  if (!current) return null;
  const previous = fold(userQuestions[userQuestions.length - 2] || "");
  const comparisonWords = /\b(compar\w*|aumentaram|diminuiram|evolucao)\b/;
  const categoryWords = /\bcategorias?\b|\b(maiores?|mais) gastos\b/;
  const corrective = /^(mas|nao|so|somente|quero|mostre|mostrar|e as|e os)\b/;
  const inheritedComparison = corrective.test(current) &&
    categoryWords.test(current) && comparisonWords.test(previous);
  if (!comparisonWords.test(current) && !inheritedComparison) return null;

  const explicit = explicitComparisonMonths(current, referenceYear);
  const reuse = /\b(mesmos? meses?|novamente|outra vez)\b/.test(current) || inheritedComparison;
  const fromHistory = reuse && !explicit
    ? userQuestions.slice(0, -1).slice(-10).reverse()
      .map((question) => explicitComparisonMonths(question, referenceYear))
      .find((pair) => pair !== null) || null
    : null;
  const pair = explicit || fromHistory;

  return {
    isComparison: true,
    byCategory: categoryWords.test(current),
    earlierKey: pair?.[0] ?? null,
    laterKey: pair?.[1] ?? null,
  };
}

export type CategoryComparisonRow = {
  category: string;
  before: number;
  after: number;
  difference: number;
};

export function rankCategoryComparisons(
  before: readonly (readonly [string, number])[],
  after: readonly (readonly [string, number])[],
): CategoryComparisonRow[] {
  const left = new Map(before);
  const right = new Map(after);
  return [...new Set([...left.keys(), ...right.keys()])]
    .map((category) => {
      const beforeAmount = left.get(category) || 0;
      const afterAmount = right.get(category) || 0;
      return {
        category,
        before: beforeAmount,
        after: afterAmount,
        difference: Math.round((afterAmount - beforeAmount) * 100) / 100,
      };
    })
    .filter((row) => row.before !== 0 || row.after !== 0)
    .sort((a, b) => b.after - a.after || Math.abs(b.difference) - Math.abs(a.difference) || a.category.localeCompare(b.category));
}
