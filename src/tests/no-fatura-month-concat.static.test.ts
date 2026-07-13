import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";


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

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/(\.test\.|\.spec\.)/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function listFrontendFiles(): string[] {
  const root = resolve(__dirname, "../..");
  const dirs = ["src/routes", "src/components", "src/lib", "src/hooks"];
  const files: string[] = [];
  for (const d of dirs) {
    try { walk(join(root, d), files); } catch { /* dir may not exist */ }
  }
  return files.filter((f) => !IGNORE.has(f));
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
