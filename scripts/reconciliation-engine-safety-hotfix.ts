import type { Plugin } from "vite";

/**
 * Narrows automatic installment checks to invariants the current data model can
 * prove safely. Legacy/imported installment groups may legitimately start after
 * installment 1 and installment_source_amount has historical mixed semantics,
 * so neither condition is treated as an error.
 */
export function reconciliationEngineSafetyHotfix(): Plugin {
  return {
    name: "cofre360-reconciliation-engine-safety-hotfix",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("/src/lib/reconciliation/engine.ts")) return null;
      let next = code;

      next = next.replace(
        /\n  for \(const \[name, cards\] of cardsByName\) \{\n    if \(name && cards\.length > 1\) \{\n      pushIssue\(divs, "card", `Nome de cartão duplicado: \$\{cards\[0\]\.name\}`, 1, cards\.length\);\n    \}\n  \}\n/,
        "\n",
      );

      next = next.replace(
        /    const missing = expectedTotal > 0[\s\S]*?    if \(unique\.size !== numbers\.length\) \{\n      pushIssue\(divs, "installment", `Parcelamento \$\{groupId\} possui parcela duplicada`, unique\.size, numbers\.length\);\n    \}\n\n    const sourceAmount = Math\.max\([\s\S]*?    \}\n/,
        `    const invalidNumbers = numbers.filter((n) => n < 1 || (expectedTotal > 0 && n > expectedTotal));\n    if (invalidNumbers.length > 0) {\n      pushIssue(divs, "installment", \`Parcelamento \${groupId} possui número de parcela inválido\`, 0, invalidNumbers.length);\n    }\n    if (unique.size !== numbers.length) {\n      pushIssue(divs, "installment", \`Parcelamento \${groupId} possui parcela duplicada\`, unique.size, numbers.length);\n    }\n    const sorted = [...unique].filter((n) => n > 0).sort((a, b) => a - b);\n    if (sorted.length > 1) {\n      const internalGaps: number[] = [];\n      for (let n = sorted[0] + 1; n < sorted[sorted.length - 1]; n += 1) {\n        if (!unique.has(n)) internalGaps.push(n);\n      }\n      if (internalGaps.length > 0) {\n        pushIssue(divs, "installment", \`Parcelamento \${groupId} tem lacuna interna · faltam \${internalGaps.join(", ")}\`, 0, internalGaps.length);\n      }\n    }\n`,
      );

      next = next.replace(
        'summary("installment", "Sequência e valores dos parcelamentos", checked, divs.length)',
        'summary("installment", "Duplicidades, lacunas internas e numeração dos parcelamentos", checked, divs.length)',
      );

      if (next === code) return null;
      return { code: next, map: null };
    },
  };
}
