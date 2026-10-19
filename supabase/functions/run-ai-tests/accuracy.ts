/** Numeric checks are separate from keyword/format scores. A financial answer
 * must contain the correct amount next to the expected label, not somewhere else. */
export type MoneyCheck = { label: string; amount: number; alternativeLabels?: string[] };

export function moneyBR(amount: number): string {
  const absolute = Math.abs(amount);
  return `${amount < 0 ? "-" : ""}R$ ${absolute.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function checkFinancialAmounts(
  answer: string,
  expectations: MoneyCheck[],
): { passed: number; total: number; findings: string[] } {
  const normalized = answer.replace(/\*\*/g, "").replace(/[\u00a0\u202f]/g, " ").replace(/\s+/g, " ");
  const findings: string[] = [];
  let passed = 0;
  for (const { label, amount, alternativeLabels = [] } of expectations) {
    if (!Number.isFinite(amount)) {
      findings.push(`❌ ${label}: valor esperado indisponível`);
      continue;
    }
    const expected = moneyBR(amount);
    // Match a label and amount together, avoiding a false positive when the
    // correct number is present under a different financial concept.
    const safeAmount = expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s*");
    // Accept only explicitly approved aliases for the SAME financial concept.
    const matchesLabeledAmount = [label, ...alternativeLabels].some((candidate) => {
      const safeLabel = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matcher = new RegExp("\\b" + safeLabel + "\\s*:\\s*" + safeAmount + "(?![\\d.,])", "i");
      return matcher.test(normalized);
    });
    if (matchesLabeledAmount) {
      passed++;
      findings.push(`✅ valor conferido: ${label}`);
    } else {
      findings.push(`❌ ${label}: esperado ${expected}`);
    }
  }
  return { passed, total: expectations.length, findings };
}
