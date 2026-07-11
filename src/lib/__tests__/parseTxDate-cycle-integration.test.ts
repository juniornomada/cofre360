import { describe, it, expect } from "vitest";
import { parseTxDate, getCycleDates, groupByBillingCycle, type CardTransaction } from "../invoice-utils";

/**
 * Integração: canônico de `parseTxDate` bate exatamente com o ciclo
 * calculado por `getCycleDates` (e o bucket produzido por
 * `groupByBillingCycle`) para os MESMOS inputs ambíguos cobertos pelas
 * suítes property-based e cenário-a-cenário.
 *
 * Diferença deste arquivo: as suítes anteriores comparam apenas o
 * `getTime()` de `parseTxDate`. Aqui a asserção é ponta-a-ponta, isto é,
 * o input ruidoso deve ir para o MESMO período de fatura que o input
 * canônico — validando o contrato real usado pela UI de `/cards` e
 * pela Home.
 *
 * Cenários cobertos:
 *  - Dashes ASCII e Unicode misturados (`-`, `/`, en/em/figure/hyphen/minus,
 *    small e fullwidth variants).
 *  - Ruído de espaço em torno do separador (SP, NBSP, NNBSP, ZWSP, BOM).
 *  - Meses fronteira (Dez↔Jan) que ativam a heurística de ano do parser.
 *  - Combinações (closingDay, dueDay) que atravessam o mês do fallback.
 */

// Fallback fixado longe da fronteira Dez↔Jan para isolar variações de
// heurística de ano (essas têm suíte própria).
const FALLBACK_MID_YEAR = "2026-06-15T12:00:00Z";
// Fallback dentro da fronteira, para ativar a heurística Dez↔Jan.
const FALLBACK_LATE_YEAR = "2026-12-30T12:00:00Z";
const FALLBACK_EARLY_YEAR = "2026-01-05T12:00:00Z";

// Referência fixa (uma data corrente que o app está exibindo) — o mesmo
// referenceDate é passado para `groupByBillingCycle` e para
// `getCycleDates`, então ambos calculam períodos idênticos.
const REFERENCE = new Date("2026-07-20T12:00:00Z");

function periodKeyForDate(txDate: Date, closingDay: number, dueDay: number, reference: Date): string {
  // Reproduz a lógica de bucketing de `groupByBillingCycle` usando apenas
  // `getCycleDates` — se ambas concordarem para o mesmo Date de entrada,
  // a integração está consistente.
  const { currentClose, prevClose } = getCycleDates(reference, closingDay, dueDay);
  const pastClose = new Date(prevClose.getFullYear(), prevClose.getMonth() - 1, closingDay || 1);
  if (txDate > pastClose && txDate <= prevClose) return "past";
  if (txDate > prevClose && txDate <= currentClose) return "current";
  // Futuros: primeiro ciclo após currentClose.
  let futureStart = new Date(currentClose);
  for (let i = 0; i < 24; i++) {
    const futureEnd = new Date(futureStart.getFullYear(), futureStart.getMonth() + 1, closingDay || 1);
    if (txDate > futureStart && txDate <= futureEnd) return `future_${i}`;
    futureStart = futureEnd;
  }
  return "out_of_range";
}

function makeTx(id: string, date: string, created_at: string): CardTransaction {
  return {
    id,
    name: `tx-${id}`,
    icon: null,
    category: "test",
    card: "card-1",
    date,
    amount: 100,
    type: "expense",
    created_at,
    total_installments: null,
    installment_number: null,
    installment_group_id: null,
  };
}

// [canônico, [variantes ambíguas...]]
const SCENARIOS: Array<{ canonical: string; noisy: string[]; fallback: string }> = [
  {
    // Fronteira Dez com fallback dezembro/final do ano — ativa heurística.
    canonical: "31/12",
    noisy: [
      "31-12", "31 -12", "31- 12", "31 - 12",
      "31\u201312", "31\u201412", "31\u221212",
      "31\u2013 12", "31 \u201312", "31 \u2013 12",
      "31\u00A0-\u00A012", "31\u202F-\u202F12",
      "31\u200B-\u200B12", "31\uFEFF-\uFEFF12",
    ],
    fallback: FALLBACK_LATE_YEAR,
  },
  {
    // Fronteira Jan com fallback início do ano — heurística mantém ano.
    canonical: "01/01",
    noisy: [
      "01-01", "1-1", "1\u20131", "01\u201401", "01\u221201",
      "01 - 01", "01\u00A0-\u00A001", " 01\u2013 01 ",
    ],
    fallback: FALLBACK_EARLY_YEAR,
  },
  {
    // Meio de ano — sem heurística.
    canonical: "15/07",
    noisy: [
      "15-07", "15 -07", "15- 07", "15 - 07",
      "15\u201307", "15\u201407", "15\u221207",
      "15 \u2013 07",
    ],
    fallback: FALLBACK_MID_YEAR,
  },
  {
    // Ano completo — dashes misturados de várias origens.
    canonical: "31/12/2026",
    noisy: [
      "31-12-2026", "31 - 12 - 2026",
      "31\u201312\u20132026", "31 \u2013 12 \u2013 2026",
      "31\u221212\u22122026", "31-12\u20132026",
      "31\uFF0D12\uFF0D2026", // fullwidth hyphen-minus
    ],
    fallback: FALLBACK_LATE_YEAR,
  },
  {
    // Ano de 2 dígitos.
    canonical: "10/07/26",
    noisy: [
      "10-07-26", "10 - 07 - 26",
      "10\u201307\u201326", "10\uFE6307\uFE6326",
    ],
    fallback: FALLBACK_MID_YEAR,
  },
];

// Grade de configurações de fatura reais (fechamento/vencimento).
const CYCLE_CONFIGS: Array<[number, number]> = [
  [1, 10],   // fechamento início, vencimento início
  [10, 20],  // meio de mês
  [25, 5],   // fecha fim, vence início do próximo
  [28, 15],  // fim de mês
];

describe("Integração: parseTxDate canônico ↔ getCycleDates/groupByBillingCycle", () => {
  for (const scenario of SCENARIOS) {
    for (const [closingDay, dueDay] of CYCLE_CONFIGS) {
      const label = `${scenario.canonical} @ close=${closingDay} due=${dueDay} fb=${scenario.fallback.slice(0, 10)}`;

      it(`bucket idêntico para todas as variantes: ${label}`, () => {
        const canonicalDate = parseTxDate(scenario.canonical, scenario.fallback);
        expect(Number.isFinite(canonicalDate.getTime())).toBe(true);

        // Usa a própria data canônica como referência do ciclo — garante
        // que o bucket "current" abrange o tx canônico e, com isso, o
        // teste valida um caso não-vazio para todas as configurações
        // (fechamento/vencimento) e cenários de mês.
        const reference = canonicalDate;
        const expectedKey = periodKeyForDate(canonicalDate, closingDay, dueDay, reference);

        for (const noisy of scenario.noisy) {
          const noisyDate = parseTxDate(noisy, scenario.fallback);
          expect(Number.isFinite(noisyDate.getTime()), `NaN em ${JSON.stringify(noisy)}`).toBe(true);

          // (a) `getCycleDates` — cycle key computada diretamente.
          const noisyKey = periodKeyForDate(noisyDate, closingDay, dueDay, reference);
          expect(
            noisyKey,
            `cycle drift: canonical=${JSON.stringify(scenario.canonical)} (${expectedKey}) vs noisy=${JSON.stringify(noisy)} (${noisyKey})`,
          ).toBe(expectedKey);

          // (b) `groupByBillingCycle` — invariante ponta-a-ponta com o
          // pipeline real usado pela UI. Criamos DUAS transações
          // (canônica + ruidosa) e verificamos que caem no mesmo
          // period.key.
          const txs: CardTransaction[] = [
            makeTx("canonical", scenario.canonical, scenario.fallback),
            makeTx("noisy", noisy, scenario.fallback),
          ];
          const periods = groupByBillingCycle(txs, closingDay, dueDay, reference);
          const findPeriod = (id: string) =>
            periods.find((p) => p.transactions.some((t) => t.id === id));
          const canonicalPeriod = findPeriod("canonical");
          const noisyPeriod = findPeriod("noisy");

          expect(canonicalPeriod, `canonical não alocada em ${JSON.stringify(scenario.canonical)}`).toBeDefined();
          expect(noisyPeriod, `noisy não alocada em ${JSON.stringify(noisy)}`).toBeDefined();
          expect(
            noisyPeriod!.key,
            `groupByBillingCycle drift: canonical→${canonicalPeriod!.key} vs noisy(${JSON.stringify(noisy)})→${noisyPeriod!.key}`,
          ).toBe(canonicalPeriod!.key);
        }
      });
    }
  }
});
