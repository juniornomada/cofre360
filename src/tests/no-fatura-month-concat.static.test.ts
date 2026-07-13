import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "node:fs";

/**
 * Static-source guard: no front-end file may build the legacy label
 * "Fatura {mês}" (or any dynamic "Fatura <expression>") as visible text.
 *
 * Allowed exact strings (fixed copy, never templated with a month/period):
 *   - "Fatura total"
 *   - "Fatura atual (R$)"
 *   - "Fatura não gerada"
 *   - "Fatura sem despesas"
 *   - "Composição da Fatura"
 *   - "Pagar Fatura — {payingCard?.name}"  (dialog title, uses card name)
 *   - "Faturas"                             (plural section title)
 *
 * Anything of the shape `Fatura {…}` or `Fatura ${…}` is forbidden — use
 * `formatDueLabel(dueDate)` from `@/lib/format-due-date` instead.
 */

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// Files intentionally excluded from the guard.
const IGNORE = new Set<string>([
  // Test files and doc/audit artefacts.
]);

function listFrontendFiles(): string[] {
  const patterns = [
    "src/routes/**/*.{ts,tsx}",
    "src/components/**/*.{ts,tsx}",
    "src/lib/**/*.{ts,tsx}",
    "src/hooks/**/*.{ts,tsx}",
  ];
  const files = new Set<string>();
  for (const p of patterns) {
    for (const f of globSync(p, { cwd: resolve(__dirname, "../.."), absolute: true })) {
      if (/(\.test\.|\.spec\.|__tests__)/.test(f)) continue;
      if (IGNORE.has(f)) continue;
      files.add(f);
    }
  }
  return [...files];
}

describe("no legacy 'Fatura {mês}' wording in the front-end", () => {
  const files = listFrontendFiles();

  it("no file concatenates a month name after 'Fatura '", () => {
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const m of monthNames) {
        expect(
          new RegExp(`Fatura\\s+${m}`, "i").test(src),
          `${file} contains legacy 'Fatura ${m}' wording`,
        ).toBe(false);
      }
    }
  });

  it("no file templates a period/month expression after 'Fatura '", () => {
    // Reject `Fatura {...}` and `Fatura ${...}` when the expression looks
    // like a period/month/label reference. Keep the allowed fixed strings.
    const forbidden = [
      /Fatura\s*\{[^}]*month/i,
      /Fatura\s*\$\{[^}]*month/i,
      /Fatura\s*\{[^}]*period/i,
      /Fatura\s*\$\{[^}]*period/i,
      /Fatura\s*\{[^}]*\.label/i,
      /Fatura\s*\$\{[^}]*\.label/i,
    ];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const rx of forbidden) {
        expect(rx.test(src), `${file} builds a dynamic 'Fatura {…}' label — use formatDueLabel(dueDate)`).toBe(false);
      }
    }
  });
});
