import { describe, it, expect } from "vitest";
import { parseTxDate } from "@/lib/invoice-utils";

/**
 * Regressões pinadas do fuzz `parseTxDate-year-boundary-fuzz.test.ts`.
 *
 * Cada `describe` abaixo cobre, com entradas literais (sem LCG), os
 * formatos exatos que historicamente dispararam falhas nas três suítes
 * do fuzz:
 *
 *  - linha 49  (seed 0xDECA1)  → heurística Dez↔Jan sem ano explícito
 *  - linha 167 (seed 0xABCDEF) → expansão YY → 20YY perto de 00/99
 *  - linha 218 (seed 0xBADFEE) → ruído de separador (espaços, duplicação)
 *
 * Estes casos são determinísticos e servem como "canário": se o parser
 * regredir num destes vetores, saberemos exatamente qual invariante quebrou.
 */

const iso = (y: number, m0: number, d: number, h = 12) =>
  new Date(Date.UTC(y, m0, d, h, 0, 0)).toISOString();

// ────────────────────────────────────────────────────────────────────────
// Regressões de linha 49: Dez↔Jan sem ano
// ────────────────────────────────────────────────────────────────────────
describe("regressão fuzz L49 — Dez↔Jan sem ano explícito", () => {
  // Formato: [input textual, created_at ISO, ano esperado, mês esperado (0-idx), dia esperado]
  const cases: Array<[string, string, number, number, number]> = [
    // "jan" criado em dezembro → ano seguinte
    ["5 jan",       iso(2025, 11, 31, 23), 2026, 0, 5],
    ["05 janeiro",  iso(2025, 11, 20),     2026, 0, 5],
    ["1 Jan",       iso(2025, 11, 15),     2026, 0, 1],
    ["31 JAN",      iso(2025, 11, 28),     2026, 0, 31],
    ["10 jan.",     iso(2025, 11, 31),     2026, 0, 10],
    ["15 jan,",     iso(2025, 11, 31),     2026, 0, 15],
    // "dez" criado em janeiro → ano anterior
    ["31 dez",      iso(2026, 0, 1, 0),    2025, 11, 31],
    ["15 dezembro", iso(2026, 0, 10),      2025, 11, 15],
    ["1 Dez",       iso(2026, 0, 5),       2025, 11, 1],
    ["20 DEZ.",     iso(2026, 0, 2),       2025, 11, 20],
    // Meses não-fronteira NÃO devem sofrer shift
    ["10 jul",      iso(2025, 11, 31),     2025, 6, 10],
    ["10 jul",      iso(2026, 0, 1),       2026, 6, 10],
    ["5 nov",       iso(2026, 0, 1),       2026, 10, 5],
    ["5 fev",       iso(2025, 11, 31),     2025, 1, 5],
  ];

  it.each(cases)("parseTxDate(%j, %j)", (input, createdAt, y, m, d) => {
    const parsed = parseTxDate(input, createdAt);
    expect(parsed.getFullYear(), `year for "${input}" @ ${createdAt}`).toBe(y);
    expect(parsed.getMonth(),    `month for "${input}" @ ${createdAt}`).toBe(m);
    expect(parsed.getDate(),     `day for "${input}" @ ${createdAt}`).toBe(d);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Regressões de linha 167: expansão YY → 20YY perto de 00/99
// ────────────────────────────────────────────────────────────────────────
describe("regressão fuzz L167 — YY sempre expande para 20YY", () => {
  const cases: Array<[string, string, number, number, number]> = [
    // Boundaries extremos de YY
    ["31/12/99", iso(2025, 11, 31, 23), 2099, 11, 31],
    ["01/01/00", iso(2026, 0, 1, 0),    2000, 0, 1],
    ["31-12-99", iso(2025, 11, 31),     2099, 11, 31],
    ["01-01-00", iso(2026, 0, 1),       2000, 0, 1],
    // YY "normais" próximos do ano atual
    ["10/07/26", iso(2026, 6, 10),      2026, 6, 10],
    ["05/01/26", iso(2025, 11, 31),     2026, 0, 5],
    ["31/12/25", iso(2026, 0, 1),       2025, 11, 31],
    // YY "distantes" — jamais 19YY
    ["15/03/70", iso(2025, 5, 1),       2070, 2, 15],
    ["15-03-98", iso(2025, 5, 1),       2098, 2, 15],
    ["01/01/50", iso(2020, 0, 1),       2050, 0, 1],
    // Perto do pivô Dez↔Jan MAS com YY explícito → o ano do input vence
    ["05/01/25", iso(2025, 11, 31),     2025, 0, 5], // não vira 2026
    ["31/12/26", iso(2026, 0, 1),       2026, 11, 31], // não vira 2025
  ];

  it.each(cases)("parseTxDate(%j, %j)", (input, createdAt, y, m, d) => {
    const parsed = parseTxDate(input, createdAt);
    expect(parsed.getFullYear(), `year for "${input}"`).toBe(y);
    expect(parsed.getMonth(),    `month for "${input}"`).toBe(m);
    expect(parsed.getDate(),     `day for "${input}"`).toBe(d);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Regressões de linha 218: ruído de separador na fronteira
// ────────────────────────────────────────────────────────────────────────
describe("regressão fuzz L218 — ruído de separador não quebra parsing", () => {
  // Vetores exatos que quebraram o fuzz na primeira execução
  // ("15 / 07", "31 - 12", separadores espaçados/duplicados).
  const cases: Array<[string, string, number, number, number]> = [
    // Espaços em torno da barra
    ["15 / 07",       iso(2025, 6, 15),      2025, 6, 15],
    [" 15/07 ",       iso(2025, 6, 15),      2025, 6, 15],
    [" 15 / 07 ",     iso(2025, 6, 15),      2025, 6, 15],
    // Espaços em torno do hífen
    ["31 - 12",       iso(2025, 11, 31),     2025, 11, 31],
    ["01 - 01",       iso(2026, 0, 1),       2026, 0, 1],
    // Fronteira Dez↔Jan com espaçamento e sem ano
    ["31 / 12",       iso(2026, 0, 1),       2025, 11, 31],
    ["01 / 01",       iso(2025, 11, 31, 23), 2026, 0, 1],
    // Espaçamento + YY
    ["31 / 12 / 99",  iso(2025, 11, 31),     2099, 11, 31],
    ["01 - 01 - 00",  iso(2026, 0, 1),       2000, 0, 1],
    // Sufixo/prefixo de whitespace exótico (mantém correção)
    ["\t15/07\t",     iso(2025, 6, 15),      2025, 6, 15],
    ["\n31/12\n",     iso(2025, 11, 31),     2025, 11, 31],
  ];

  it.each(cases)("parseTxDate(%j, %j)", (input, createdAt, y, m, d) => {
    const parsed = parseTxDate(input, createdAt);
    expect(Number.isNaN(parsed.getTime()), `NaN for "${input}"`).toBe(false);
    expect(parsed.getFullYear(), `year for "${input}"`).toBe(y);
    expect(parsed.getMonth(),    `month for "${input}"`).toBe(m);
    expect(parsed.getDate(),     `day for "${input}"`).toBe(d);
  });
});
