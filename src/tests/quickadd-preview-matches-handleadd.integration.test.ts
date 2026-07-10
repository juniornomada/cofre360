/**
 * Integration test — a prévia exibida no diálogo de "Nova transação"
 * (Valor por parcela / Valor de cada parcela + Total a lançar) DEVE ser
 * idêntica aos valores efetivamente enviados por handleAdd para qualquer
 * "parcela atual" válido (1..N).
 *
 * Espelhamos aqui as duas fontes de verdade que existem em
 * src/components/QuickAddTransactionDialog.tsx:
 *
 *   (A) PRÉVIA (linhas ~276-294 do diálogo)
 *       installmentDetails      = calculateInstallmentDetails(amount, count, mode, fixed)
 *       previewStart            = clamp(installmentStart, 1..count)
 *       previewRemaining        = count - previewStart + 1
 *       previewRemainingTotal   = installmentDetails.valorParcela * previewRemaining
 *
 *   (B) handleAdd (linhas ~417-445 do diálogo)
 *       startAt = clamp(installmentStart, 1..count)
 *       para i em [startAt..count]:
 *         parcela = calculateInstallmentDetails(amount, count, mode, fixed).valorParcela
 *         rows.push({ amount: parcela, installment_number: i, total_installments: count, ... })
 *
 * Contrato validado:
 *   1. Todas as linhas persistidas usam EXATAMENTE valorParcela da prévia.
 *   2. rows.length === previewRemaining.
 *   3. Σ(rows.amount) === previewRemainingTotal (bit-a-bit em centavos).
 *   4. installment_number cobre [startAt..count] sem lacunas.
 *   5. installment_source_amount é consistente com o modo (fixed → parcela*count, divide → amount).
 */
import { describe, it, expect } from "vitest";
import { calculateInstallmentDetails, type InstallmentMode } from "@/lib/installment-utils";
import { toDivideMode, toFixedMode } from "@/lib/installment-mode-toggle";

/** Espelho fiel do bloco de prévia do diálogo. */
function computePreview(
  amount: number,
  count: number,
  mode: InstallmentMode,
  fixed: number,
  installmentStart: number,
) {
  const details = calculateInstallmentDetails(amount, count, mode, fixed);
  const previewTotal = count;
  const rawStart = Number(installmentStart);
  const previewStart = !Number.isFinite(rawStart) || rawStart < 1
    ? 1
    : rawStart > previewTotal
      ? previewTotal
      : Math.trunc(rawStart);
  const previewRemaining = Math.max(0, previewTotal - previewStart + 1);
  const previewRemainingTotal =
    Math.round(details.valorParcela * previewRemaining * 100) / 100;
  return { details, previewStart, previewRemaining, previewRemainingTotal };
}

/** Espelho fiel do bloco de inserção de handleAdd (branch parcelado do cartão). */
function buildHandleAddRows(
  amount: number,
  count: number,
  mode: InstallmentMode,
  fixed: number,
  installmentStart: number,
) {
  const startAt = Math.min(Math.max(1, installmentStart || 1), count);
  const rows: Array<{
    amount: number;
    installment_number: number;
    total_installments: number;
    installment_mode: InstallmentMode;
    installment_source_amount: number;
  }> = [];
  for (let i = startAt; i <= count; i++) {
    const { valorParcela: parcela } = calculateInstallmentDetails(
      amount,
      count,
      mode,
      fixed,
    );
    rows.push({
      amount: parcela,
      installment_number: i,
      total_installments: count,
      installment_mode: mode,
      installment_source_amount:
        mode === "fixed" ? Math.round(parcela * count * 100) / 100 : amount,
    });
  }
  return rows;
}

const CENTS = (n: number) => Math.round(n * 100);
const sumAmounts = (rows: { amount: number }[]) =>
  Math.round(rows.reduce((acc, r) => acc + r.amount, 0) * 100) / 100;

interface Scenario {
  name: string;
  amount: number;
  count: number;
  mode: InstallmentMode;
  fixed: number;
}

const SCENARIOS: Scenario[] = [
  { name: "R$400 divide 4x",    amount: 400,      count: 4,   mode: "divide", fixed: 0 },
  { name: "R$100 divide 3x (dízima)", amount: 100, count: 3,  mode: "divide", fixed: 0 },
  { name: "R$1.999,99 divide 12x", amount: 1999.99, count: 12, mode: "divide", fixed: 0 },
  { name: "R$150 fixed 6x",     amount: 150,      count: 6,   mode: "fixed",  fixed: 150 },
  { name: "R$83,33 fixed 3x",   amount: 83.33,    count: 3,   mode: "fixed",  fixed: 83.33 },
  { name: "R$10 divide 1x",     amount: 10,       count: 1,   mode: "divide", fixed: 0 },
  { name: "R$9.999,97 divide 24x", amount: 9999.97, count: 24, mode: "divide", fixed: 0 },
  { name: "R$1,00 fixed 60x",   amount: 1,        count: 60,  mode: "fixed",  fixed: 1 },
];

describe("Prévia do diálogo === valores enviados por handleAdd (parcela atual variável)", () => {
  for (const sc of SCENARIOS) {
    describe(sc.name, () => {
      for (let start = 1; start <= sc.count; start++) {
        it(`parcela atual = ${start}/${sc.count}`, () => {
          const preview = computePreview(sc.amount, sc.count, sc.mode, sc.fixed, start);
          const rows = buildHandleAddRows(sc.amount, sc.count, sc.mode, sc.fixed, start);

          // (2) qtd de linhas === previewRemaining
          expect(rows.length).toBe(preview.previewRemaining);

          // (1) cada linha usa exatamente valorParcela da prévia (bit-a-bit em centavos)
          for (const r of rows) {
            expect(CENTS(r.amount)).toBe(CENTS(preview.details.valorParcela));
          }

          // (3) soma das linhas === previewRemainingTotal
          expect(CENTS(sumAmounts(rows))).toBe(CENTS(preview.previewRemainingTotal));

          // (4) installment_number cobre [start..count] sem lacunas
          expect(rows.map(r => r.installment_number))
            .toEqual(Array.from({ length: sc.count - start + 1 }, (_, k) => start + k));
          for (const r of rows) expect(r.total_installments).toBe(sc.count);

          // (5) installment_source_amount coerente com modo
          for (const r of rows) {
            if (sc.mode === "fixed") {
              expect(CENTS(r.installment_source_amount))
                .toBe(CENTS(preview.details.valorParcela * sc.count));
            } else {
              expect(CENTS(r.installment_source_amount)).toBe(CENTS(sc.amount));
            }
          }
        });
      }

      it("parcela atual = count → apenas 1 linha, valor == prévia", () => {
        const preview = computePreview(sc.amount, sc.count, sc.mode, sc.fixed, sc.count);
        const rows = buildHandleAddRows(sc.amount, sc.count, sc.mode, sc.fixed, sc.count);
        expect(rows.length).toBe(1);
        expect(preview.previewRemaining).toBe(1);
        expect(CENTS(rows[0].amount)).toBe(CENTS(preview.details.valorParcela));
        expect(CENTS(sumAmounts(rows))).toBe(CENTS(preview.previewRemainingTotal));
      });
    });
  }

  it("caso canônico do requisito (R$400 / 4x, start=3) — lança 3/4 e 4/4 com 2× valorParcela", () => {
    const preview = computePreview(400, 4, "divide", 0, 3);
    const rows = buildHandleAddRows(400, 4, "divide", 0, 3);

    expect(preview.details.valorParcela).toBe(100);
    expect(preview.previewRemaining).toBe(2);
    expect(preview.previewRemainingTotal).toBe(200);

    expect(rows.length).toBe(2);
    expect(rows.map(r => r.installment_number)).toEqual([3, 4]);
    expect(rows.every(r => r.amount === 100)).toBe(true);
    expect(sumAmounts(rows)).toBe(200);
  });

  it("start fora do intervalo é saneado igualmente na prévia e no handleAdd (defesa em profundidade)", () => {
    // Mesmo com validação no UI, o clamp interno de ambos os caminhos precisa ser idêntico.
    for (const badStart of [0, -5, 999]) {
      const preview = computePreview(400, 4, "divide", 0, badStart);
      const rows = buildHandleAddRows(400, 4, "divide", 0, badStart);
      expect(rows.length).toBe(preview.previewRemaining);
      expect(CENTS(sumAmounts(rows))).toBe(CENTS(preview.previewRemainingTotal));
    }
  });
});
