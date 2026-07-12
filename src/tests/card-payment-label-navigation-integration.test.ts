import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { formatCardPaymentLabel } from "@/lib/card-payment-label";

/**
 * Integration guard: navegação e ações relacionadas a cartões — troca de
 * período (fatura anterior/atual/futura) e alternância de estado
 * (parcial ↔ total, com/sem pagamentos prévios, com/sem transações) —
 * NÃO devem reintroduzir a descrição antiga ("Pagamento ... fatura cartão")
 * nem construir o rótulo fora do helper canônico.
 */

const SRC_DIR = join(process.cwd(), "src");
const CANONICAL_HELPER = join("src", "lib", "card-payment-label.ts");

const CODE_EXTENSIONS = new Set([".ts", ".tsx"]);
const EXCLUDED_SEGMENTS = ["__tests__", "/tests/", ".test.", ".spec."];

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, acc);
    } else if (CODE_EXTENSIONS.has(extname(entry))) {
      acc.push(full);
    }
  }
  return acc;
}

function productionFiles(): string[] {
  return walk(SRC_DIR).filter((p) => {
    const rel = p.slice(process.cwd().length + 1);
    if (rel === CANONICAL_HELPER) return false;
    return !EXCLUDED_SEGMENTS.some((seg) => rel.includes(seg));
  });
}

describe("Cards — integração: navegação/ações não reintroduzem descrição antiga", () => {
  const files = productionFiles();

  it("nenhum arquivo de produção contém a wording legada 'Pagamento ... fatura cartão'", () => {
    const legacy = /Pagamento\s+(Total|Parcial|parcial|total)\s+fatura\s+cart[aã]o/;
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (legacy.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("nenhum arquivo de produção monta o rótulo inline (template com 'cartão ${...}')", () => {
    // Apenas o helper canônico pode conter o template literal do rótulo.
    // Isso previne que ações de "Ver fatura anterior", "Adicionar transação"
    // ou handlers de pagamento em novas telas voltem a montar strings à mão.
    const inlineTemplate =
      /Pagamento\s+(Total|Parcial)\s+cart[aã]o\s+\$\{/;
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (inlineTemplate.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("cards.tsx importa e usa exclusivamente formatCardPaymentLabel para o rótulo", () => {
    const cards = readFileSync(join(SRC_DIR, "routes", "cards.tsx"), "utf8");
    expect(cards).toMatch(/from\s+["']@\/lib\/card-payment-label["']/);
    expect(cards).toMatch(/formatCardPaymentLabel\s*\(/);
    // Não pode restar concatenação/interpolação manual do rótulo.
    expect(cards).not.toMatch(/`Pagamento\s+(Total|Parcial)\s+cart[aã]o\s+\$\{/);
    expect(cards).not.toMatch(/Pagamento\s+(Total|Parcial)\s+fatura/);
  });
});

describe("Cards — integração: rótulo estável em toda permutação de período/estado", () => {
  // Simula as combinações que a UI cria ao alternar entre faturas
  // (anterior/atual/futura) e ao alternar entre pagamento parcial e total,
  // com e sem pagamentos prévios ou transações no período.
  const cardNames = ["Porto Bank", "Mercado Pago", "Nubank", "C6 Black"];
  const periods = [
    { label: "fatura anterior", endDate: new Date("2026-06-10") },
    { label: "fatura atual", endDate: new Date("2026-07-10") },
    { label: "fatura futura", endDate: new Date("2026-08-10") },
  ];
  const states: Array<{
    isTotal: boolean;
    hadPriorPayments: boolean;
    hasTransactions: boolean;
  }> = [
    { isTotal: true, hadPriorPayments: false, hasTransactions: true },
    { isTotal: false, hadPriorPayments: false, hasTransactions: true },
    { isTotal: true, hadPriorPayments: true, hasTransactions: true },
    { isTotal: false, hadPriorPayments: true, hasTransactions: true },
    { isTotal: false, hadPriorPayments: true, hasTransactions: false },
  ];

  for (const name of cardNames) {
    for (const period of periods) {
      for (const state of states) {
        const scenario = `${name} • ${period.label} • ${
          state.isTotal ? "total" : "parcial"
        }${state.hadPriorPayments ? " • c/ pagamentos prévios" : ""}${
          state.hasTransactions ? "" : " • sem transações"
        }`;

        it(`rótulo canônico e sem 'fatura' — ${scenario}`, () => {
          const label = formatCardPaymentLabel(
            state.isTotal ? "total" : "partial",
            name,
          );
          const expectedPrefix = state.isTotal
            ? "Pagamento Total cartão "
            : "Pagamento Parcial cartão ";
          expect(label).toBe(`${expectedPrefix}${name}`);
          expect(label).not.toMatch(/fatura/i);
          expect(label).not.toMatch(/\s{2,}/);
          expect(label).not.toMatch(/[\n\r\t]/);
          // Independente de período/estado, o rótulo depende SÓ de kind+nome.
        });
      }
    }
  }
});
