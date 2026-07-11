import { describe, it, expect } from "vitest";
import { parseTxDate } from "../invoice-utils";

/**
 * Resiliência de `parseTxDate` contra entradas extremamente longas
 * e ruidosas.
 *
 * Um input textual malicioso ou corrompido no banco (ex.: descrição
 * colada no campo `date` por engano, blob binário decodificado como
 * UTF-8, etc.) NÃO pode:
 *   1. Travar o parser (regex catastrófico, loop infinito).
 *   2. Retornar Date inválido (NaN) — o fallback determinístico
 *      via `created_at` (ou "agora") é o piso de segurança.
 *
 * Estratégia:
 *   - Gera payloads sinteticamente enormes (até ~1 MB de texto) com
 *     PRNG determinístico: dígitos, letras, pontuação, invisíveis,
 *     separadores, tokens que se parecem com meses/dias, etc.
 *   - Mede tempo por chamada usando `performance.now()`. O limite é
 *     generoso (250ms) para acomodar CI lento, mas suficiente para
 *     detectar regressões O(n²) ou backtracking exponencial.
 *   - Verifica que o retorno é sempre um Date com `getTime()` finito.
 *
 * Nota: NÃO usamos `vi.setSystemTime` nem timers falsos — precisamos
 * do relógio real para o gate de tempo.
 */

// -----------------------------------------------------------------------------
// PRNG determinístico.
// -----------------------------------------------------------------------------
function makeRng(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s;
  };
  return {
    int: (n: number) => next() % n,
    pick: <T,>(arr: readonly T[]): T => arr[next() % arr.length],
  };
}

// Pool de caracteres — mistura tudo o que o parser deveria tolerar.
const CHARS: readonly string[] = [
  ..."0123456789",
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..." \t\n\r",
  ...".,;:!?/-_()[]{}<>|\\@#$%&*+=\"'`~^",
  "\u200B", "\u200C", "\u200D", "\uFEFF", "\u00A0",
  "\u2028", "\u2029", "\u202F", "\u205F", "\u180E",
  // fragmentos que se parecem com meses/dias para provocar o token path
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
  "janeiro", "fevereiro", "março", "abril",
  "10", "31", "01", "07", "12",
  "/", "-",
];

function makeNoise(rng: ReturnType<typeof makeRng>, len: number): string {
  const parts: string[] = [];
  let acc = 0;
  while (acc < len) {
    const c = rng.pick(CHARS);
    parts.push(c);
    acc += c.length;
  }
  return parts.join("").slice(0, len);
}

const FALLBACK_ISO = "2026-07-10T12:00:00.000Z";
const PER_CALL_BUDGET_MS = 250;

// -----------------------------------------------------------------------------
// Testes.
// -----------------------------------------------------------------------------
describe("parseTxDate — resiliência a inputs longos e ruidosos", () => {
  const SIZES = [1_000, 10_000, 100_000, 1_000_000];

  for (const size of SIZES) {
    it(`ruído aleatório de ${size} chars: não trava e não retorna NaN`, () => {
      const rng = makeRng(0xa5a5_0000 ^ size);
      const input = makeNoise(rng, size);

      const t0 = performance.now();
      const parsed = parseTxDate(input, FALLBACK_ISO);
      const elapsed = performance.now() - t0;

      expect(Number.isNaN(parsed.getTime()), `retornou Date inválido para size=${size}`).toBe(false);
      expect(parsed).toBeInstanceOf(Date);
      expect(elapsed, `parser levou ${elapsed.toFixed(1)}ms para size=${size}`).toBeLessThan(
        PER_CALL_BUDGET_MS,
      );
    });
  }

  it("repetição patológica de separadores (`//////...`) — não trava e cai no fallback", () => {
    const input = "/".repeat(500_000);
    const t0 = performance.now();
    const parsed = parseTxDate(input, FALLBACK_ISO);
    const elapsed = performance.now() - t0;

    expect(Number.isNaN(parsed.getTime())).toBe(false);
    expect(elapsed).toBeLessThan(PER_CALL_BUDGET_MS);
    // Sem tokens válidos → fallback determinístico exato.
    expect(parsed.toISOString()).toBe(new Date(FALLBACK_ISO).toISOString());
  });

  it("repetição de caractere invisível (U+200B × 500k) — não trava e cai no fallback", () => {
    const input = "\u200B".repeat(500_000);
    const t0 = performance.now();
    const parsed = parseTxDate(input, FALLBACK_ISO);
    const elapsed = performance.now() - t0;

    expect(Number.isNaN(parsed.getTime())).toBe(false);
    expect(elapsed).toBeLessThan(PER_CALL_BUDGET_MS);
    expect(parsed.toISOString()).toBe(new Date(FALLBACK_ISO).toISOString());
  });

  it("prefixo válido enterrado em 100k de ruído — não trava e não é NaN", () => {
    const rng = makeRng(0xfeed_face);
    const junk = makeNoise(rng, 100_000);
    // Colocar um pedaço "10 jul" no meio: o parser ou reconhece
    // (irrelevante para o contrato deste teste) ou cai no fallback.
    // Ambos os caminhos DEVEM ser rápidos e retornar Date válido.
    const input = junk.slice(0, 50_000) + " 10 jul " + junk.slice(50_000);

    const t0 = performance.now();
    const parsed = parseTxDate(input, FALLBACK_ISO);
    const elapsed = performance.now() - t0;

    expect(Number.isNaN(parsed.getTime())).toBe(false);
    expect(elapsed).toBeLessThan(PER_CALL_BUDGET_MS);
  });

  it("100 chamadas consecutivas com ruído de 50k cada — throughput agregado sob 5s", () => {
    const rng = makeRng(0xc0de_cafe);
    const inputs = Array.from({ length: 100 }, () => makeNoise(rng, 50_000));

    const t0 = performance.now();
    for (const s of inputs) {
      const parsed = parseTxDate(s, FALLBACK_ISO);
      if (Number.isNaN(parsed.getTime())) throw new Error("NaN retornado por parseTxDate");
    }
    const elapsed = performance.now() - t0;

    expect(elapsed, `100 chamadas levaram ${elapsed.toFixed(0)}ms`).toBeLessThan(5_000);
  });

  it("input vazio, whitespace e null-ish caem no fallback sem NaN", () => {
    for (const s of ["", " ", "\t\n", "\u200B\u200B", "   \u00A0  "]) {
      const parsed = parseTxDate(s, FALLBACK_ISO);
      expect(Number.isNaN(parsed.getTime()), `NaN para input=${JSON.stringify(s)}`).toBe(false);
    }
  });
});
