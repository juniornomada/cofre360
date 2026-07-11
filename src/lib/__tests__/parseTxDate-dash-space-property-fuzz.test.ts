import { describe, it, expect } from "vitest";
import { parseTxDate, getCycleDates } from "../invoice-utils";

/**
 * Property-based fuzz — entradas numéricas ambíguas com dashes Unicode/ASCII
 * intercalados com variações de espaço.
 *
 * Diferente das suítes cenário-a-cenário (parseTxDate-ambiguous-separators,
 * parseTxDate-separator-fuzz), este arquivo gera COMBINAÇÕES ALEATÓRIAS
 * de:
 *   - separadores dash/slash: `-`, `/`, `\u2010`-`\u2015` (hyphen/figure/en/em/horizontal bar),
 *     `\u2212` (minus sign), `\uFE58`/`\uFE63`/`\uFF0D` (small/fullwidth variants).
 *   - espaços em branco: SP, TAB, NBSP (\u00A0), narrow NBSP (\u202F),
 *     medium mathematical space (\u205F), zero-width (\u200B..\u200D, \uFEFF),
 *     line/paragraph separator (\u2028/\u2029), figure/em quad, etc.
 *   - envelope: espaços antes/depois do separador, espaços dobrados,
 *     mistura de dashes distintos no mesmo input (`31\u2013 -12`).
 *
 * Invariantes verificados (para TODA amostra):
 *   [I1] O resultado nunca é NaN — `d.getTime()` é finito.
 *   [I2] Idempotência: `parseTxDate(x, F) === parseTxDate(x, F)` (mesma
 *        instância de tempo em UTC).
 *   [I3] Fallback determinístico: quando o input é reduzido a apenas
 *        separadores/espaços (nenhum dígito), retorna EXATAMENTE o
 *        fallback (mesmo `getTime()`).
 *   [I4] Paridade canônica: variantes ruidosas de "DD<sep>MM" produzem o
 *        mesmo Date que a forma limpa "DD/MM".
 *   [I5] Cycle-key parity: `getCycleDates` gera a mesma cycle key para a
 *        variante ruidosa e para a forma canônica — garante que o ruído
 *        não empurra a transação para outra fatura.
 *
 * PRNG determinístico (LCG-seeded mulberry32) — falhas são 100%
 * reprodutíveis com a mesma seed.
 */

const FALLBACK = "2026-06-15T12:00:00Z";
const FALLBACK_MS = new Date(FALLBACK).getTime();

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Todos os "dashes" que `parseTxDate` normaliza para ASCII '-':
// U+2010 hyphen, U+2011 non-breaking hyphen, U+2012 figure dash,
// U+2013 en dash, U+2014 em dash, U+2015 horizontal bar,
// U+2212 minus sign, U+FE58 small em dash, U+FE63 small hyphen-minus,
// U+FF0D fullwidth hyphen-minus. Mais o ASCII '-' e '/' como controle.
const DASHES = [
  "-", "/",
  "\u2010", "\u2011", "\u2012", "\u2013", "\u2014", "\u2015",
  "\u2212", "\uFE58", "\uFE63", "\uFF0D",
];

// Espaços que o parser deve absorver/normalizar. Inclui zero-width e
// separadores de linha/parágrafo — se algum escapar do sanitizer,
// vira token e explode o parser.
const SPACES = [
  "", " ", "  ", "\t", "\n",
  "\u00A0",   // NBSP
  "\u202F",   // narrow NBSP
  "\u205F",   // medium mathematical space
  "\u200B",   // zero-width space
  "\u200C",   // zero-width non-joiner
  "\u200D",   // zero-width joiner
  "\uFEFF",   // zero-width no-break space (BOM)
  "\u180E",   // Mongolian vowel separator
  "\u2028",   // line separator
  "\u2029",   // paragraph separator
];

function cycleKey(d: Date): string {
  const { currentClose } = getCycleDates(d, 1, 10);
  return `${currentClose.getFullYear()}-${String(currentClose.getMonth() + 1).padStart(2, "0")}`;
}

describe("parseTxDate — property-based fuzz (dashes Unicode/ASCII + espaços)", () => {
  it("[I1] nunca retorna NaN para ruído composto de dashes + espaços", () => {
    const rnd = mulberry32(0xda54ed);
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const noise: string[] = [];
      const len = 1 + Math.floor(rnd() * 12);
      for (let j = 0; j < len; j++) {
        // 50% dash, 50% espaço — só ruído, sem dígitos nem letras.
        const bag = rnd() < 0.5 ? DASHES : SPACES;
        noise.push(bag[Math.floor(rnd() * bag.length)]);
      }
      const input = noise.join("");
      const out = parseTxDate(input, FALLBACK);
      expect(Number.isFinite(out.getTime()), `NaN em input=${JSON.stringify(input)}`).toBe(true);
    }
  });

  it("[I3] input só-ruído resolve ao fallback determinístico (mesmo getTime())", () => {
    const rnd = mulberry32(0x0000face);
    const N = 1500;
    for (let i = 0; i < N; i++) {
      const noise: string[] = [];
      const len = Math.floor(rnd() * 10);
      for (let j = 0; j < len; j++) {
        const bag = rnd() < 0.5 ? DASHES : SPACES;
        noise.push(bag[Math.floor(rnd() * bag.length)]);
      }
      const input = noise.join("");
      const out = parseTxDate(input, FALLBACK);
      expect(out.getTime(), `fallback drift em input=${JSON.stringify(input)}`).toBe(FALLBACK_MS);
    }
  });

  it("[I2] idempotência: reexecução com o mesmo input devolve o mesmo timestamp", () => {
    const rnd = mulberry32(0xba5eba11);
    const N = 2000;
    for (let i = 0; i < N; i++) {
      // Constrói "DD<ruído>MM[<ruído>YYYY]" com dashes/espaços aleatórios.
      const day = 1 + Math.floor(rnd() * 28);
      const month = 1 + Math.floor(rnd() * 12);
      const withYear = rnd() < 0.5;
      const year = 2020 + Math.floor(rnd() * 10);

      const sep = () => {
        const d = DASHES[Math.floor(rnd() * DASHES.length)];
        const sL = SPACES[Math.floor(rnd() * SPACES.length)];
        const sR = SPACES[Math.floor(rnd() * SPACES.length)];
        return `${sL}${d}${sR}`;
      };
      const dd = String(day).padStart(2, "0");
      const mm = String(month).padStart(2, "0");
      const input = withYear
        ? `${dd}${sep()}${mm}${sep()}${year}`
        : `${dd}${sep()}${mm}`;

      const a = parseTxDate(input, FALLBACK).getTime();
      const b = parseTxDate(input, FALLBACK).getTime();
      expect(Number.isFinite(a) && Number.isFinite(b), `NaN em input=${JSON.stringify(input)}`).toBe(true);
      expect(a, `não-determinístico em input=${JSON.stringify(input)}`).toBe(b);
    }
  });

  it("[I4][I5] paridade canônica: ruído produz o mesmo Date e cycle key que 'DD/MM[/YYYY]'", () => {
    const rnd = mulberry32(0xdeadbeef);
    const N = 2000;
    for (let i = 0; i < N; i++) {
      // Usa DIA seguro (≤28) para evitar dias que dependem da regra
      // dia-do-mês (coberta em outras suítes) e MES 1..12.
      const day = 1 + Math.floor(rnd() * 28);
      const month = 1 + Math.floor(rnd() * 12);
      const withYear = rnd() < 0.5;
      const year = 2020 + Math.floor(rnd() * 10);
      const dd = String(day).padStart(2, "0");
      const mm = String(month).padStart(2, "0");

      const canonical = withYear ? `${dd}/${mm}/${year}` : `${dd}/${mm}`;

      // Gera separador arbitrário: dash Unicode/ASCII envolto em
      // combinação aleatória de espaços (inclui zero-width).
      const sep = () => {
        const d = DASHES[Math.floor(rnd() * DASHES.length)];
        const sL = SPACES[Math.floor(rnd() * SPACES.length)];
        const sR = SPACES[Math.floor(rnd() * SPACES.length)];
        return `${sL}${d}${sR}`;
      };
      const noisy = withYear
        ? `${dd}${sep()}${mm}${sep()}${year}`
        : `${dd}${sep()}${mm}`;

      const canonicalDate = parseTxDate(canonical, FALLBACK);
      const noisyDate = parseTxDate(noisy, FALLBACK);

      expect(Number.isFinite(canonicalDate.getTime())).toBe(true);
      expect(Number.isFinite(noisyDate.getTime()), `NaN em noisy=${JSON.stringify(noisy)}`).toBe(true);
      expect(
        noisyDate.getTime(),
        `paridade quebrada:\n  canonical=${JSON.stringify(canonical)} → ${canonicalDate.toISOString()}\n  noisy    =${JSON.stringify(noisy)} → ${noisyDate.toISOString()}`,
      ).toBe(canonicalDate.getTime());
      expect(
        cycleKey(noisyDate),
        `cycle key drift em noisy=${JSON.stringify(noisy)}`,
      ).toBe(cycleKey(canonicalDate));
    }
  });

  it("[I1][I2] mistura de dashes distintos no mesmo input é determinística e nunca NaN", () => {
    // Encadear vários dashes distintos entre DD e MM ("03\u2013 - 07") é
    // input intrinsecamente ambíguo: o parser não tenta reconstruir um
    // separador único a partir de N > 1 dashes espaçados — colapsar
    // " - - " em " - " poderia mascarar um range parcial como "03-07 ao
    // 11". A garantia contratual aqui é mais fraca (e correta):
    //  - nunca retorna NaN;
    //  - é idempotente (mesmo input → mesmo timestamp);
    //  - o resultado é OU o Date canônico OU o fallback — nunca um
    //    terceiro valor "inventado".
    const rnd = mulberry32(0x1234abcd);
    const N = 1500;
    for (let i = 0; i < N; i++) {
      const day = 1 + Math.floor(rnd() * 28);
      const month = 1 + Math.floor(rnd() * 12);
      const dd = String(day).padStart(2, "0");
      const mm = String(month).padStart(2, "0");

      const chunks = 2 + Math.floor(rnd() * 4);
      let sep = "";
      for (let j = 0; j < chunks; j++) {
        sep += SPACES[Math.floor(rnd() * SPACES.length)];
        sep += DASHES[Math.floor(rnd() * DASHES.length)];
        sep += SPACES[Math.floor(rnd() * SPACES.length)];
      }
      const noisy = `${dd}${sep}${mm}`;
      const canonicalMs = parseTxDate(`${dd}/${mm}`, FALLBACK).getTime();

      const a = parseTxDate(noisy, FALLBACK).getTime();
      const b = parseTxDate(noisy, FALLBACK).getTime();
      expect(Number.isFinite(a), `NaN em noisy=${JSON.stringify(noisy)}`).toBe(true);
      expect(a, `não-determinístico em noisy=${JSON.stringify(noisy)}`).toBe(b);
      // Domínio fechado: canônico ou fallback — nunca valor inventado.
      expect(
        a === canonicalMs || a === FALLBACK_MS,
        `valor inesperado (${new Date(a).toISOString()}) para ${JSON.stringify(noisy)} — deveria ser canônico ou fallback`,
      ).toBe(true);
    }
  });
});
