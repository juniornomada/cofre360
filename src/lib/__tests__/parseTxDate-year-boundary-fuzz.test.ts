import { describe, it, expect } from "vitest";
import { parseTxDate } from "@/lib/invoice-utils";

/**
 * Fuzz específico para FRONTEIRAS DE VIRADA DE ANO em parseTxDate.
 *
 * Objetivo: garantir que a heurística Dez↔Jan (quando o input textual
 * não traz ano) e a expansão de YY → 20YY (quando traz ano de 2 dígitos)
 * são estáveis diante de:
 *  - separadores variados ("/", "-", combinações com espaços);
 *  - capitalização e pontuação nos meses ("Dez", "DEZ.", "dez,");
 *  - `created_at` posicionado em cada dia da janela crítica (Nov→Fev);
 *  - anos de 2 dígitos vs 4 dígitos vs ausência de ano.
 *
 * Cada caso é semeado deterministicamente (sem Math.random) para que
 * regressões sejam 100% reproduzíveis.
 */

// -------------------------------- utils --------------------------------
const pad2 = (n: number) => n.toString().padStart(2, "0");
const isoAt = (y: number, m0: number, d: number, h = 12): string =>
  new Date(Date.UTC(y, m0, d, h, 0, 0)).toISOString();

const monthShort = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthLong = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const caseVariants = (s: string): string[] => [
  s,
  s.toUpperCase(),
  s[0].toUpperCase() + s.slice(1),
];

const punctuationVariants = (s: string): string[] => [s, `${s}.`, `${s},`];

// Deterministic LCG so failing seeds are reproducible.
function lcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

// ----------------------------- INVARIANT -------------------------------
// Given a `date` string and a `created_at`, the *day* and *month* MUST
// match the intended textual date. Only the year is inferred.

describe("fuzz — Dez↔Jan boundary without explicit year", () => {
  const rnd = lcg(0xDECA1);
  const NOVEMBER = 10;
  const DECEMBER = 11;
  const JANUARY = 0;
  const FEBRUARY = 1;

  // Textual month | expected year offset for created_at in each anchor month
  const cases: Array<{
    monthIdx: number;
    monthTokens: string[];
    // For each created-at month (0..11) → expected year shift vs. createdYear
    yearShift: (createdMonth: number) => number;
  }> = [
    {
      monthIdx: JANUARY,
      monthTokens: [monthShort[JANUARY], monthLong[JANUARY]],
      // "jan" typed while created_at is Nov/Dec means the user was writing
      // the coming January → year = createdYear + 1.
      yearShift: (m) => (m >= NOVEMBER ? +1 : 0),
    },
    {
      monthIdx: DECEMBER,
      monthTokens: [monthShort[DECEMBER], monthLong[DECEMBER]],
      // "dez" typed while created_at is Jan/Feb means the user meant the
      // previous December → year = createdYear - 1.
      yearShift: (m) => (m <= FEBRUARY ? -1 : 0),
    },
  ];

  it("varre 4 anos × 12 meses × 4 dias × 6 variantes textuais e valida day/month/year", () => {
    const anchorYears = [2023, 2024, 2025, 2026];
    let total = 0;
    let mismatches: string[] = [];

    for (const anchorYear of anchorYears) {
      for (let cm = 0; cm < 12; cm++) {
        // sample 4 dias por (year,month) para manter runtime baixo mas amostra rica.
        const daysInAnchor = new Date(anchorYear, cm + 1, 0).getDate();
        const sampleDays = new Set<number>();
        while (sampleDays.size < Math.min(4, daysInAnchor)) {
          sampleDays.add(1 + Math.floor(rnd() * daysInAnchor));
        }
        for (const cd of sampleDays) {
          const created = isoAt(anchorYear, cm, cd, 6 + Math.floor(rnd() * 18));
          for (const { monthIdx, monthTokens, yearShift } of cases) {
            const day = 1 + Math.floor(rnd() * 28); // dia sempre válido
            for (const tokenBase of monthTokens) {
              for (const casev of caseVariants(tokenBase)) {
                for (const punct of punctuationVariants(casev)) {
                  const input = `${pad2(day)} ${punct}`;
                  const parsed = parseTxDate(input, created);
                  const expectedYear = anchorYear + yearShift(cm);
                  total++;
                  if (
                    parsed.getFullYear() !== expectedYear ||
                    parsed.getMonth() !== monthIdx ||
                    parsed.getDate() !== day
                  ) {
                    if (mismatches.length < 10) {
                      mismatches.push(
                        `input="${input}" created=${created} → got ${parsed.toISOString()} ` +
                          `expected ${expectedYear}-${pad2(monthIdx + 1)}-${pad2(day)}`,
                      );
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(mismatches, `${mismatches.length}/${total} mismatches:\n${mismatches.join("\n")}`).toEqual([]);
    expect(total).toBeGreaterThan(500);
  });
});

describe("fuzz — numeric separators around year boundary (DD/MM, DD-MM, DD MM)", () => {
  it("DD/MM e DD-MM sem ano: heurística Dez↔Jan idêntica entre separadores", () => {
    const anchor = "2025-12-31T18:00:00Z"; // created_at em fim de Dez/2025
    const mismatches: string[] = [];
    for (let d = 1; d <= 28; d++) {
      const inputs = [`${pad2(d)}/01`, `${pad2(d)}-01`, `${pad2(d)} jan`];
      const parsed = inputs.map((i) => parseTxDate(i, anchor));
      // Todos devem apontar para Jan/2026 (não Jan/2025).
      const ok = parsed.every(
        (p) => p.getFullYear() === 2026 && p.getMonth() === 0 && p.getDate() === d,
      );
      if (!ok) {
        mismatches.push(
          `day=${d}: ${inputs.map((i, idx) => `${i}→${parsed[idx].toISOString()}`).join(" | ")}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("DD/MM e DD-MM sem ano: 'dez' + created em Jan puxa para o ano anterior de forma estável", () => {
    const anchor = "2026-01-05T10:00:00Z";
    const mismatches: string[] = [];
    for (let d = 1; d <= 28; d++) {
      const inputs = [`${pad2(d)}/12`, `${pad2(d)}-12`, `${pad2(d)} dez`];
      const parsed = inputs.map((i) => parseTxDate(i, anchor));
      const ok = parsed.every(
        (p) => p.getFullYear() === 2025 && p.getMonth() === 11 && p.getDate() === d,
      );
      if (!ok) {
        mismatches.push(
          `day=${d}: ${inputs.map((i, idx) => `${i}→${parsed[idx].toISOString()}`).join(" | ")}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe("fuzz — 2-digit year expansion around the boundary", () => {
  // YY em 3 dígitos: sempre → 20YY (jamais 19YY), inclusive perto de 00/99.
  const rnd = lcg(0xABCDEF);
  const anchors = [
    "2025-12-31T23:00:00Z",
    "2026-01-01T00:30:00Z",
    "2019-12-15T12:00:00Z",
    "2020-01-05T09:00:00Z",
  ];
  const yys = ["00", "01", "05", "20", "24", "25", "26", "50", "70", "98", "99"];
  const separators = ["/", "-"];

  it("DD{sep}MM{sep}YY expande YY→20YY para qualquer created_at, incluindo bordas", () => {
    const failures: string[] = [];
    for (const anchor of anchors) {
      for (const yy of yys) {
        for (const sep of separators) {
          const day = 1 + Math.floor(rnd() * 28);
          const month = 1 + Math.floor(rnd() * 12);
          const input = `${pad2(day)}${sep}${pad2(month)}${sep}${yy}`;
          const parsed = parseTxDate(input, anchor);
          if (
            parsed.getFullYear() !== 2000 + parseInt(yy) ||
            parsed.getMonth() !== month - 1 ||
            parsed.getDate() !== day
          ) {
            failures.push(
              `input="${input}" anchor=${anchor} → got ${parsed.toISOString()}`,
            );
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("YY explícito derrota a heurística de virada de ano", () => {
    // "01/01/24" com created_at em Dez/2025 NÃO deve virar 2026.
    const anchor = "2025-12-31T23:59:00Z";
    for (const yy of ["10", "23", "24", "26", "50"]) {
      for (const sep of ["/", "-"]) {
        const input = `01${sep}01${sep}${yy}`;
        const parsed = parseTxDate(input, anchor);
        expect(parsed.getFullYear(), input).toBe(2000 + parseInt(yy));
        expect(parsed.getMonth(), input).toBe(0);
        expect(parsed.getDate(), input).toBe(1);
      }
    }
  });
});

describe("fuzz — separator noise robustness at boundary", () => {
  // Espaços em torno do separador, separador duplicado, sufixos espúrios.
  const rnd = lcg(0xBADFEE);

  const noiseWraps = [
    (s: string) => s,
    (s: string) => ` ${s} `,
    (s: string) => s.replace(/\//g, " / "),
    (s: string) => s.replace(/-/g, " - "),
    (s: string) => `${s} `,
    (s: string) => ` ${s}`,
  ];

  it("31/12 e 01/01 preservam heurística sob ruído de separador", () => {
    const failures: string[] = [];
    const scenarios: Array<{
      base: string;
      anchor: string;
      expectY: number;
      expectM: number;
      expectD: number;
    }> = [
      { base: "31/12", anchor: "2026-01-05T00:00:00Z", expectY: 2025, expectM: 11, expectD: 31 },
      { base: "31-12", anchor: "2026-01-05T00:00:00Z", expectY: 2025, expectM: 11, expectD: 31 },
      { base: "01/01", anchor: "2025-12-30T00:00:00Z", expectY: 2026, expectM: 0, expectD: 1 },
      { base: "01-01", anchor: "2025-12-30T00:00:00Z", expectY: 2026, expectM: 0, expectD: 1 },
      { base: "15/07", anchor: "2026-07-10T00:00:00Z", expectY: 2026, expectM: 6, expectD: 15 },
    ];

    for (const s of scenarios) {
      for (const wrap of noiseWraps) {
        const input = wrap(s.base);
        const parsed = parseTxDate(input, s.anchor);
        if (
          parsed.getFullYear() !== s.expectY ||
          parsed.getMonth() !== s.expectM ||
          parsed.getDate() !== s.expectD
        ) {
          failures.push(
            `input=${JSON.stringify(input)} anchor=${s.anchor} → ${parsed.toISOString()} ` +
              `(expected ${s.expectY}-${pad2(s.expectM + 1)}-${pad2(s.expectD)})`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("50 seeds aleatórios de ruído perto do dia 31/12 mantêm o resultado invariante", () => {
    const anchor = "2026-01-02T00:00:00Z";
    const expected = parseTxDate("31/12", anchor).toISOString();
    for (let i = 0; i < 50; i++) {
      const nSpaces = Math.floor(rnd() * 3);
      const spaces = " ".repeat(nSpaces);
      const sep = rnd() > 0.5 ? "/" : "-";
      const input = `${spaces}31${spaces}${sep}${spaces}12${spaces}`;
      const parsed = parseTxDate(input, anchor);
      // Todas as variantes de "31/12" no fim de Dez OU início de Jan devem
      // permanecer em Dez do ano anterior ao created_at.
      expect(parsed.getFullYear(), input).toBe(2025);
      expect(parsed.getMonth(), input).toBe(11);
      expect(parsed.getDate(), input).toBe(31);
      // E o resultado deve ser IGUAL ao canônico "31/12" — determinismo total.
      expect(parsed.toISOString(), input).toBe(expected);
    }
  });
});
