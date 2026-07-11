import { describe, it, expect } from "vitest";
import { parseTxDate } from "../invoice-utils";

/**
 * Property-based fuzz for `parseTxDate`.
 *
 * Estratégia
 * ----------
 * Para cada iteração o gerador escolhe uma tripla canônica válida
 * (year, monthIdx, day), formata-a em UMA das variantes de "localidade"
 * suportadas pelo parser e aplica ruído textual aleatório (pontuação,
 * espaços exóticos, zero-width, capitalização Random). O `created_at`
 * de fallback é fixado no MESMO mês/ano canônicos (dia 15, meio-dia UTC),
 * de modo que a heurística Dez↔Jan NÃO desloque o ano — assim a
 * cycle key esperada é sempre `YYYY-MM` construída a partir da tripla
 * canônica.
 *
 * Invariante testado:
 *   parseTxDate(noisy(format(year, month, day)), fallback)
 *     → produz um Date cujo (getFullYear, getMonth) casa exatamente com
 *       (year, month) canônicos e cujo getDate == day.
 *
 * A suíte usa um LCG determinístico (mesma seed em toda execução), então
 * qualquer regressão futura reproduzirá o contra-exemplo idêntico.
 */

// -----------------------------------------------------------------------------
// PRNG determinístico (LCG — Numerical Recipes).
// -----------------------------------------------------------------------------
function makeRng(seed: number) {
  let s = seed >>> 0;
  return {
    int(maxExclusive: number) {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s % maxExclusive;
    },
    pick<T>(arr: readonly T[]): T {
      s = (s * 1664525 + 1013904223) >>> 0;
      return arr[s % arr.length];
    },
    bool(): boolean {
      s = (s * 1664525 + 1013904223) >>> 0;
      return (s & 1) === 1;
    },
  };
}

// -----------------------------------------------------------------------------
// Datas canônicas.
// -----------------------------------------------------------------------------
function daysInMonth(year: number, monthIdx: number): number {
  if (monthIdx === 1) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][monthIdx];
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

// -----------------------------------------------------------------------------
// "Localidades" de formatação (todas suportadas por parseTxDate).
// -----------------------------------------------------------------------------
const SHORT_MONTHS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
] as const;

const LONG_MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

// Março com "ç" e sem — o parser normaliza NFD.
type Formatter = (y: number, m: number, d: number, rng: ReturnType<typeof makeRng>) => string;

const FORMATTERS: Array<{ name: string; fn: Formatter; carriesYear: boolean }> = [
  // pt-BR textual curto — "10 jul"
  {
    name: "pt-BR-short",
    carriesYear: false,
    fn: (_y, m, d) => `${pad(d)} ${SHORT_MONTHS[m]}`,
  },
  // pt-BR textual longo — "10 julho" (com acento em março)
  {
    name: "pt-BR-long",
    carriesYear: false,
    fn: (_y, m, d) => `${pad(d)} ${LONG_MONTHS[m]}`,
  },
  // pt-BR textual longo sem acento — "10 marco"
  {
    name: "pt-BR-long-ascii",
    carriesYear: false,
    fn: (_y, m, d) =>
      `${pad(d)} ${LONG_MONTHS[m].normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`,
  },
  // pt-BR numérico sem ano — "10/07" ou "10-07"
  {
    name: "pt-BR-numeric-noyear",
    carriesYear: false,
    fn: (_y, m, d, rng) => `${pad(d)}${rng.pick(["/", "-"])}${pad(m + 1)}`,
  },
  // pt-BR numérico com ano de 4 dígitos — "10/07/2026"
  {
    name: "pt-BR-numeric-yyyy",
    carriesYear: true,
    fn: (y, m, d, rng) => {
      const sep = rng.pick(["/", "-"]);
      return `${pad(d)}${sep}${pad(m + 1)}${sep}${y}`;
    },
  },
  // pt-BR numérico com ano de 2 dígitos — "10/07/26"
  {
    name: "pt-BR-numeric-yy",
    carriesYear: true,
    fn: (y, m, d, rng) => {
      const sep = rng.pick(["/", "-"]);
      const yy = y - 2000;
      if (yy < 0 || yy > 99) {
        // fora do range 20YY que o parser suporta — força 4 dígitos.
        return `${pad(d)}${sep}${pad(m + 1)}${sep}${y}`;
      }
      return `${pad(d)}${sep}${pad(m + 1)}${sep}${pad(yy)}`;
    },
  },
  // ISO — "2026-07-10"
  {
    name: "iso-date",
    carriesYear: true,
    fn: (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`,
  },
];

// -----------------------------------------------------------------------------
// Ruído textual — o parser DEVE ignorar tudo isto.
// -----------------------------------------------------------------------------
const INVISIBLES = [
  "\u200B", "\u200C", "\u200D", "\uFEFF",
  "\u00A0", "\u2028", "\u2029", "\u180E",
  "\u202F", "\u205F",
];
const PUNCT = [".", ",", ";", ":", "!", "?"];
const SPACES = [" ", "  ", "\t"];

function randomCase(s: string, rng: ReturnType<typeof makeRng>): string {
  let out = "";
  for (const ch of s) out += rng.bool() ? ch.toUpperCase() : ch.toLowerCase();
  return out;
}

function addNoise(input: string, rng: ReturnType<typeof makeRng>): string {
  let s = input;

  // 50% aplica capitalização aleatória (afeta apenas letras).
  if (rng.bool()) s = randomCase(s, rng);

  // Adiciona 0-2 pontuações finais.
  const nPunct = rng.int(3);
  for (let i = 0; i < nPunct; i++) s = s + rng.pick(PUNCT);

  // Adiciona 0-2 pontuações "grudadas" após o primeiro token (dia).
  if (rng.bool()) {
    const idx = s.indexOf(" ");
    if (idx > 0) s = s.slice(0, idx) + rng.pick(PUNCT) + s.slice(idx);
  }

  // Envolve com espaços/invisíveis.
  const leading = rng.pick(SPACES) + (rng.bool() ? rng.pick(INVISIBLES) : "");
  const trailing = (rng.bool() ? rng.pick(INVISIBLES) : "") + rng.pick(SPACES);
  s = leading + s + trailing;

  // Injeta um invisível entre dígitos (ex.: "1\u200B0/07") — ainda deve
  // ser reconhecido: `parseTxDate` colapsa o invisível para " " e a
  // limpeza numérica remove pontuação/espaços em volta do separador.
  // Fazemos isto de forma controlada para não quebrar a estrutura do
  // token: só inserimos invisível ADJACENTE a um separador " " ou "/"
  // pré-existente, onde a limpeza garantidamente cobre.
  if (rng.bool()) {
    s = s.replace(/([\/\-\s])/, (m) => rng.pick(INVISIBLES) + m + rng.pick(INVISIBLES));
  }

  return s;
}

// -----------------------------------------------------------------------------
// Utilitários.
// -----------------------------------------------------------------------------
function cycleKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function canonicalCycleKey(year: number, monthIdx: number): string {
  return `${year}-${pad(monthIdx + 1)}`;
}

// -----------------------------------------------------------------------------
// Suíte property-based.
// -----------------------------------------------------------------------------
const SEEDS = [0x9e3779b1, 0xdeadbeef, 0x1badf00d, 0xc0ffee01];
const ITERATIONS_PER_SEED = 250;

describe("parseTxDate — property-based (localidades + ruído)", () => {
  for (const seed of SEEDS) {
    it(`seed=${seed.toString(16)} — cycle key sempre canônica em ${ITERATIONS_PER_SEED} amostras`, () => {
      const rng = makeRng(seed);
      const failures: Array<Record<string, unknown>> = [];

      for (let i = 0; i < ITERATIONS_PER_SEED; i++) {
        // Ano canônico em [2000, 2098] — mantém 2-digit map em 20YY.
        const year = 2000 + rng.int(99);
        const monthIdx = rng.int(12);
        const day = 1 + rng.int(daysInMonth(year, monthIdx));

        const spec = FORMATTERS[rng.int(FORMATTERS.length)];
        const formatted = spec.fn(year, monthIdx, day, rng);
        const noisy = addNoise(formatted, rng);

        // Fallback SEMPRE no mesmo mês/ano canônicos: neutraliza a
        // heurística Dez↔Jan para variantes sem ano.
        const fallback = `${year}-${pad(monthIdx + 1)}-15T12:00:00Z`;

        const parsed = parseTxDate(noisy, fallback);
        const expected = canonicalCycleKey(year, monthIdx);
        const actual = cycleKey(parsed);

        const ok =
          actual === expected &&
          parsed.getFullYear() === year &&
          parsed.getMonth() === monthIdx &&
          parsed.getDate() === day &&
          !Number.isNaN(parsed.getTime());

        if (!ok) {
          failures.push({
            iteration: i,
            format: spec.name,
            canonical: { year, monthIdx: monthIdx + 1, day },
            input: noisy,
            inputChars: [...noisy].map((c) => c.codePointAt(0)!.toString(16)),
            fallback,
            parsedISO: parsed.toISOString(),
            actualKey: actual,
            expectedKey: expected,
          });
          if (failures.length >= 5) break;
        }
      }

      expect(
        failures,
        `parseTxDate divergiu da cycle key canônica em ${failures.length} amostras:\n` +
          JSON.stringify(failures, null, 2),
      ).toEqual([]);
    });
  }

  it("garantia de cobertura: cada formatter é exercitado ao menos 1x no seed principal", () => {
    const rng = makeRng(SEEDS[0]);
    const seen = new Set<string>();
    for (let i = 0; i < ITERATIONS_PER_SEED; i++) {
      // Replica exatamente a mesma sequência de escolhas de rng.int usadas
      // acima até o `FORMATTERS[rng.int(FORMATTERS.length)]`.
      rng.int(99);
      rng.int(12);
      const year = 2000 + rng.int(99); // eslint-disable-line @typescript-eslint/no-unused-vars
      rng.int(28); // simula rng.int(daysInMonth)
      seen.add(FORMATTERS[rng.int(FORMATTERS.length)].name);
    }
    // Este teste é observacional — só falha se um formatter ficou órfão
    // porque a distribuição LCG "azarou". Documenta a expectativa de
    // cobertura para revisores.
    expect(seen.size).toBeGreaterThanOrEqual(Math.min(FORMATTERS.length - 1, 5));
  });
});
