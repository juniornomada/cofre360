/** Numeric checks are separate from keyword/format scores. A financial answer
 * must contain the correct amount next to the expected label, not somewhere else. */
export type MoneyCheck = { label: string; amount: number; alternativeLabels?: string[]; separator?: "colon" | "dash" | "either"; allowPositivePlus?: boolean };

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
  const lines = answer.split(/\r?\n/).map((line) => line.replace(/\*\*/g, "").replace(/[\u00a0\u202f]/g, " ").replace(/\s+/g, " "));
  const findings: string[] = [];
  let passed = 0;
  for (const { label, amount, alternativeLabels = [], separator = "colon", allowPositivePlus = false } of expectations) {
    if (!Number.isFinite(amount)) {
      findings.push(`❌ ${label}: valor esperado indisponível`);
      continue;
    }
    const expected = moneyBR(amount);
    // Match a label and amount together, avoiding a false positive when the
    // correct number is present under a different financial concept.
    const safeAmount = expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s*");
    const separatorRegex = separator === "colon" ? ":" : separator === "dash" ? "[—–-]" : "[:—–-]";
    const amountRegex = amount >= 0 && allowPositivePlus ? "\\+?" + safeAmount : safeAmount;
    // Accept only explicitly approved aliases for the SAME financial concept.
    const matchesLabeledAmount = [label, ...alternativeLabels].some((candidate) => {
      const safeLabel = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matcher = new RegExp("\\b" + safeLabel + "\\s*" + separatorRegex + "\\s*" + amountRegex + "(?![\\d.,])", "i");
      return lines.some((line) => matcher.test(line));
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

/** Compare displayed subcategory item sum with canonical root-category total.
 * This does NOT independently verify each subcategory against the database. */
export function checkSubcategorySum(answer: string, expectedAmount: number): { passed: number; total: number; findings: string[] } {
  if (!Number.isFinite(expectedAmount)) return { passed: 0, total: 1, findings: ["❌ Subcategorias: valor canônico indisponível"] };
  let subtotalCents = 0;
  let count = 0;
  for (const line of answer.split(/\r?\n/)) {
    const text = line.replace(/\*\*/g, "").trim();
    const match = text.match(/^-\s+(.+?)\s+[—–]\s+(-?R\$\s*[\d.]+,\d{2})\s*$/);
    if (!match) continue;
    const amount = Number(match[2].replace(/\s/g, "").replace("R$", "").replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(amount)) return { passed: 0, total: 1, findings: ["❌ Subcategorias: valor inválido"] };
    subtotalCents += Math.round(amount * 100);
    count++;
  }
  const ok = subtotalCents === Math.round(expectedAmount * 100) && (count > 0 || expectedAmount === 0);
  return { passed: ok ? 1 : 0, total: 1, findings: [ok
    ? "✅ soma das subcategorias confere com o total da categoria"
    : "❌ subcategorias não somam o total canônico da categoria"] };
}
