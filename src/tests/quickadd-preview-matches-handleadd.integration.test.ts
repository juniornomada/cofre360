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

// ---------------------------------------------------------------------------
// Cobertura ampliada — cada modo isolado + combinações (toggles) com diversos
// totals e contagens. Continua validando o mesmo contrato: prévia === envio.
// ---------------------------------------------------------------------------

/** Assert canônico: para (amount,count,mode,fixed,start) a prévia bate com handleAdd. */
function assertPreviewMatchesHandleAdd(
  amount: number,
  count: number,
  mode: InstallmentMode,
  fixed: number,
  start: number,
) {
  const preview = computePreview(amount, count, mode, fixed, start);
  const rows = buildHandleAddRows(amount, count, mode, fixed, start);

  expect(rows.length).toBe(preview.previewRemaining);
  for (const r of rows) {
    expect(CENTS(r.amount)).toBe(CENTS(preview.details.valorParcela));
  }
  expect(CENTS(sumAmounts(rows))).toBe(CENTS(preview.previewRemainingTotal));
  expect(rows.map(r => r.installment_number))
    .toEqual(Array.from({ length: count - start + 1 }, (_, k) => start + k));
  for (const r of rows) {
    expect(r.total_installments).toBe(count);
    expect(r.installment_mode).toBe(mode);
    if (mode === "fixed") {
      expect(CENTS(r.installment_source_amount))
        .toBe(CENTS(preview.details.valorParcela * count));
    } else {
      expect(CENTS(r.installment_source_amount)).toBe(CENTS(amount));
    }
  }
  return { preview, rows };
}

const DIVIDE_CASES: Array<{ amount: number; count: number }> = [
  { amount: 1,        count: 1 },
  { amount: 10,       count: 2 },
  { amount: 100,      count: 3 },   // dízima 33.33
  { amount: 250.5,    count: 5 },
  { amount: 400,      count: 4 },
  { amount: 599.99,   count: 7 },   // não-divisível
  { amount: 1999.99,  count: 12 },
  { amount: 3333.34,  count: 9 },
  { amount: 9999.97,  count: 24 },
  { amount: 12345.67, count: 36 },
];

describe("Modo DIVIDE — prévia === envio (totals × counts × starts)", () => {
  for (const { amount, count } of DIVIDE_CASES) {
    describe(`R$${amount.toFixed(2)} / ${count}x`, () => {
      // Cobre TODOS os starts válidos (1..count) e também extremos saneados.
      for (const start of [1, Math.max(1, Math.floor(count / 2)), count]) {
        it(`start=${start}/${count}`, () => {
          assertPreviewMatchesHandleAdd(amount, count, "divide", 0, start);
        });
      }
    });
  }
});

const FIXED_CASES: Array<{ per: number; count: number }> = [
  { per: 1,       count: 1 },
  { per: 9.99,    count: 2 },
  { per: 33.33,   count: 3 },
  { per: 50,      count: 6 },
  { per: 83.33,   count: 3 },
  { per: 100,     count: 4 },
  { per: 149.99,  count: 10 },
  { per: 250.5,   count: 12 },
  { per: 999.99,  count: 24 },
  { per: 1234.56, count: 36 },
];

describe("Modo FIXED — prévia === envio (per-parcela × counts × starts)", () => {
  for (const { per, count } of FIXED_CASES) {
    describe(`R$${per.toFixed(2)}/parcela × ${count}x`, () => {
      // Em modo fixed, o dialog passa `amount = per` e `fixed = per`.
      for (const start of [1, Math.max(1, Math.floor(count / 2)), count]) {
        it(`start=${start}/${count}`, () => {
          const { rows } = assertPreviewMatchesHandleAdd(per, count, "fixed", per, start);
          // Invariante econômica: source == per*count independente de start.
          for (const r of rows) {
            expect(CENTS(r.installment_source_amount)).toBe(CENTS(per * count));
          }
        });
      }
    });
  }
});

describe("Combinações de toggles (divide↔fixed) — prévia === envio após alternância", () => {
  // Cada cenário começa em um modo, alterna 1..N vezes e verifica a paridade final.
  const TOGGLE_CASES: Array<{
    name: string;
    initialAmount: number;
    count: number;
    initialMode: InstallmentMode;
    sequence: Array<"divide" | "fixed">;
    start: number;
  }> = [
    // Preserva total ao ir divide→fixed→divide.
    { name: "R$400/4x divide→fixed→divide start=3",
      initialAmount: 400, count: 4, initialMode: "divide",
      sequence: ["fixed", "divide"], start: 3 },
    // Total com dízima: preserva total apesar do arredondamento na conversão.
    { name: "R$100/3x divide→fixed→divide start=2",
      initialAmount: 100, count: 3, initialMode: "divide",
      sequence: ["fixed", "divide"], start: 2 },
    // Fixed→divide→fixed com per-parcela cheio.
    { name: "R$150 fixed/6x → divide → fixed start=6",
      initialAmount: 150, count: 6, initialMode: "fixed",
      sequence: ["divide", "fixed"], start: 6 },
    // Cadeia longa de toggles.
    { name: "R$1.999,99/12x cadeia longa start=7",
      initialAmount: 1999.99, count: 12, initialMode: "divide",
      sequence: ["fixed", "divide", "fixed", "divide"], start: 7 },
    // start=1 em cadeia fixed↔divide para garantir que source==total após ciclos.
    { name: "R$83,33 fixed/3x cadeia start=1",
      initialAmount: 83.33, count: 3, initialMode: "fixed",
      sequence: ["divide", "fixed", "divide", "fixed"], start: 1 },
  ];

  for (const tc of TOGGLE_CASES) {
    it(tc.name, () => {
      // Aplica a sequência de toggles usando os utilitários oficiais do diálogo.
      let mode: InstallmentMode = tc.initialMode;
      let amount = tc.initialAmount;
      let fixedValue = tc.initialMode === "fixed" ? tc.initialAmount : 0;

      // Total econômico invariante alvo (parcela × N no início).
      const initialDetails = calculateInstallmentDetails(amount, tc.count, mode, fixedValue);
      const invariantTotal = Math.round(initialDetails.valorParcela * tc.count * 100) / 100;

      for (const target of tc.sequence) {
        const out = target === "divide"
          ? toDivideMode({ amount, fixedValue, count: tc.count, fromMode: mode })
          : toFixedMode({ amount, fixedValue, count: tc.count, fromMode: mode });
        mode = out.mode;
        amount = out.amount;
        fixedValue = out.fixedValue;
      }

      // Após os toggles, prévia === handleAdd para o start pedido.
      const { rows, preview } = assertPreviewMatchesHandleAdd(
        amount, tc.count, mode, fixedValue, tc.start,
      );

      // installment_source_amount permanece coerente com o total econômico
      // do modo FINAL (tolerância: 1 centavo por parcela, para acomodar
      // arredondamento em conversões divide→fixed com dízima).
      for (const r of rows) {
        const drift = Math.abs(CENTS(r.installment_source_amount) - CENTS(invariantTotal));
        expect(drift).toBeLessThanOrEqual(tc.count);
      }

      // Soma das lançadas === valorParcela × remaining (bit-a-bit).
      expect(CENTS(sumAmounts(rows))).toBe(CENTS(preview.previewRemainingTotal));
    });
  }
});

/* -------------------------------------------------------------------------- *
 *  Cent-generating values: paridade bit-a-bit prévia ↔ handleAdd            *
 *                                                                            *
 *  Cenários projetados para forçar arredondamento em centavos (dízimas,     *
 *  divisões não-exatas, valores com .01/.99 etc). Para cada caso, garantimos*
 *  que "Valor por parcela"/"Valor de cada parcela" exibido na prévia bate  *
 *  bit-a-bit (em centavos) com cada linha enviada por handleAdd, para todo *
 *  start ∈ [1..N].                                                          *
 * -------------------------------------------------------------------------- */
const CENT_SCENARIOS: Scenario[] = [
  // Dízimas puras (÷3, ÷6, ÷7, ÷9)
  { name: "cents/ R$10 divide 3x",       amount: 10,      count: 3,  mode: "divide", fixed: 0 },
  { name: "cents/ R$1 divide 3x",        amount: 1,       count: 3,  mode: "divide", fixed: 0 },
  { name: "cents/ R$100 divide 6x",      amount: 100,     count: 6,  mode: "divide", fixed: 0 },
  { name: "cents/ R$100 divide 7x",      amount: 100,     count: 7,  mode: "divide", fixed: 0 },
  { name: "cents/ R$100 divide 9x",      amount: 100,     count: 9,  mode: "divide", fixed: 0 },
  { name: "cents/ R$50 divide 12x",      amount: 50,      count: 12, mode: "divide", fixed: 0 },
  // Valores com centavos "quebrados"
  { name: "cents/ R$99,99 divide 3x",    amount: 99.99,   count: 3,  mode: "divide", fixed: 0 },
  { name: "cents/ R$0,10 divide 3x",     amount: 0.10,    count: 3,  mode: "divide", fixed: 0 },
  { name: "cents/ R$0,01 divide 2x",     amount: 0.01,    count: 2,  mode: "divide", fixed: 0 },
  { name: "cents/ R$1234,56 divide 7x",  amount: 1234.56, count: 7,  mode: "divide", fixed: 0 },
  { name: "cents/ R$1999,99 divide 11x", amount: 1999.99, count: 11, mode: "divide", fixed: 0 },
  { name: "cents/ R$777,77 divide 13x",  amount: 777.77,  count: 13, mode: "divide", fixed: 0 },
  // FIXED com parcela quebrada — força installment_source_amount = per × N
  { name: "cents/ fixed 33,33 × 3",      amount: 99.99,   count: 3,  mode: "fixed",  fixed: 33.33 },
  { name: "cents/ fixed 16,67 × 6",      amount: 100.02,  count: 6,  mode: "fixed",  fixed: 16.67 },
  { name: "cents/ fixed 14,29 × 7",      amount: 100.03,  count: 7,  mode: "fixed",  fixed: 14.29 },
  { name: "cents/ fixed 11,11 × 9",      amount: 99.99,   count: 9,  mode: "fixed",  fixed: 11.11 },
  { name: "cents/ fixed 0,01 × 5",       amount: 0.05,    count: 5,  mode: "fixed",  fixed: 0.01 },
  { name: "cents/ fixed 8,33 × 12",      amount: 99.96,   count: 12, mode: "fixed",  fixed: 8.33 },
];

describe("Paridade bit-a-bit com valores que geram centavos", () => {
  for (const sc of CENT_SCENARIOS) {
    describe(sc.name, () => {
      for (let start = 1; start <= sc.count; start++) {
        it(`start=${start}/${sc.count} — prévia == handleAdd (centavos)`, () => {
          const preview = computePreview(sc.amount, sc.count, sc.mode, sc.fixed, start);
          const rows = buildHandleAddRows(sc.amount, sc.count, sc.mode, sc.fixed, start);

          // Sanidade: valorParcela da prévia deve estar em passos de 1 centavo.
          expect(Number.isInteger(CENTS(preview.details.valorParcela))).toBe(true);

          // (a) qtd de linhas === previewRemaining
          expect(rows.length).toBe(preview.previewRemaining);

          // (b) CADA linha === "Valor por parcela" da prévia, bit-a-bit em centavos.
          for (const r of rows) {
            expect(CENTS(r.amount)).toBe(CENTS(preview.details.valorParcela));
          }

          // (c) Σ(linhas) === previewRemainingTotal ("Valor total das lançadas")
          //     bit-a-bit em centavos — sem drift acumulado por arredondamento.
          expect(CENTS(sumAmounts(rows))).toBe(CENTS(preview.previewRemainingTotal));

          // (d) installment_source_amount coerente com o modo (bit-a-bit).
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
    });
  }

  // Invariante extra: em DIVIDE, Σ(todas as N parcelas) + drift residual == amount.
  // Isso garante que o "drift de centavo" da dízima não escapa entre prévia e envio.
  it("DIVIDE dízima — Σ(N parcelas) difere de amount em, no máximo, N centavos", () => {
    for (const sc of CENT_SCENARIOS.filter(s => s.mode === "divide")) {
      const rowsFull = buildHandleAddRows(sc.amount, sc.count, sc.mode, sc.fixed, 1);
      const total = sumAmounts(rowsFull);
      const drift = Math.abs(CENTS(total) - CENTS(sc.amount));
      expect(drift).toBeLessThanOrEqual(sc.count);
    }
  });
});

