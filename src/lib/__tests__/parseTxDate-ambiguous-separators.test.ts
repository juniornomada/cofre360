import { describe, it, expect } from "vitest";
import { parseTxDate, getCycleDates } from "../invoice-utils";

/**
 * Regression: entradas com separadores ambíguos ao redor de "-" e "–".
 *
 * O caractere "-" é o mesmo usado para introduzir sinal negativo, e a
 * variante Unicode "–" (U+2013, en dash) aparece em teclados macOS e em
 * texto colado do Excel/Numbers. Precisamos garantir:
 *  1. NUNCA retornar NaN.
 *  2. Idempotência: chamadas repetidas com o mesmo input devolvem o mesmo
 *     timestamp.
 *  3. Paridade canônica: a variante com espaço/dash espaçado/Unicode dash
 *     produz o mesmo Date que a forma canônica "DD/MM" ou "DD/MM/YYYY".
 *  4. Compatibilidade com `getCycleDates`: a cycle key (YYYY-MM do
 *     `currentClose`) derivada é a mesma para todas as variantes.
 *
 * Fallback anchor está fixo em 2026-06-15 para isolar dos efeitos da
 * heurística Dez↔Jan (coberta em outras suítes).
 */

const FALLBACK = "2026-06-15T12:00:00Z";

function cycleKey(d: Date, closingDay = 1, dueDay = 10): string {
  const { currentClose } = getCycleDates(d, closingDay, dueDay);
  return `${currentClose.getFullYear()}-${String(currentClose.getMonth() + 1).padStart(2, "0")}`;
}

describe("parseTxDate — separadores ambíguos ('-', '–', espaçados)", () => {
  // Grupos: [canônico, [variantes ambíguas...]]
  const groups: Array<[string, string[]]> = [
    // Fronteira Dez — clássico "31-12" e ruído em torno do traço.
    ["31/12", ["31-12", "31 -12", "31- 12", "31 - 12", "31\u201312", "31 \u201312", "31\u2013 12", "31 \u2013 12", "31\u201412", "31\u221212"]],
    // Fronteira Jan — cycle key deve permanecer 2026-01 (fallback Jun 2026 → Jan aciona +1 apenas se fallback ≥ Nov; aqui fica no mesmo ano).
    ["01/01", ["01-01", "01 -01", "01- 01", "01 - 01", "01\u201301", "1\u2013 1", "1 \u20131", " 01 - 01 "]],
    // Meio de ano — sem heurística envolvida.
    ["15/07", ["15-07", "15 -07", "15- 07", "15 - 07", "15\u201307", "15\u2013 07", "15 \u201307", "15\u221207"]],
    // Com ano completo — dashes misturados.
    ["31/12/2026", ["31-12-2026", "31 - 12 - 2026", "31\u201312\u20132026", "31 \u2013 12 \u2013 2026", "31\u221212\u22122026", "31-12\u20132026"]],
    // Com ano de 2 dígitos.
    ["31/12/2027", ["31-12-27", "31 - 12 - 27", "31\u201312\u201327"]],
  ];

  it.each(groups)("'%s' — variantes ambíguas coincidem exatamente com o canônico", (canonical, variants) => {
    const base = parseTxDate(canonical, FALLBACK);
    expect(isNaN(base.getTime())).toBe(false);
    for (const v of variants) {
      const parsed = parseTxDate(v, FALLBACK);
      // 1. sem NaN
      expect(isNaN(parsed.getTime()), `NaN para ${JSON.stringify(v)}`).toBe(false);
      // 2. idempotência
      expect(parseTxDate(v, FALLBACK).getTime()).toBe(parsed.getTime());
      // 3. paridade canônica
      expect(parsed.getTime(), `mismatch: ${JSON.stringify(v)} vs canônico ${JSON.stringify(canonical)}`).toBe(base.getTime());
    }
  });

  it.each(groups)("'%s' — cycle key coincide com o canônico em múltiplas configurações", (canonical, variants) => {
    const base = parseTxDate(canonical, FALLBACK);
    // Três combinações comuns de fechamento/vencimento (bordas incluídas).
    const configs: Array<[number, number]> = [[1, 10], [15, 25], [28, 5]];
    for (const [closing, due] of configs) {
      const baseKey = cycleKey(base, closing, due);
      for (const v of variants) {
        const parsed = parseTxDate(v, FALLBACK);
        expect(cycleKey(parsed, closing, due), `cycle drift em ${JSON.stringify(v)} @ ${closing}/${due}`).toBe(baseKey);
      }
    }
  });

  it("entradas patológicas puramente ambíguas nunca produzem NaN e caem no fallback determinístico", () => {
    // Um traço solto ou apenas separadores não formam data válida — devem
    // cair no `fallback` (2026-06-15) sem transbordar para outra data.
    const fallbackMs = new Date(FALLBACK).getTime();
    for (const noise of ["-", " - ", "\u2013", " \u2013 ", "--", "\u2013\u2013", "31-", "-12", " 31 - ", " \u2013 12 "]) {
      const parsed = parseTxDate(noise, FALLBACK);
      expect(isNaN(parsed.getTime()), `NaN para ${JSON.stringify(noise)}`).toBe(false);
      // Idempotência
      expect(parseTxDate(noise, FALLBACK).getTime()).toBe(parsed.getTime());
      // Para ruído sem par (dia,mês) válido, o resultado é o fallback.
      // "31-" / "-12" / " 31 - " são incompletos → fallback.
      if (["-", " - ", "\u2013", " \u2013 ", "--", "\u2013\u2013", "31-", "-12", " 31 - "].includes(noise)) {
        expect(parsed.getTime(), `ruído ${JSON.stringify(noise)} deveria cair no fallback`).toBe(fallbackMs);
      }
    }
  });
});
