/**
 * Regressões pinadas: entradas numéricas com separadores espaçados
 *
 *   "15 / 07"   — dia/mês com espaços em volta da barra
 *   "31 - 12"   — dia/mês com espaços em volta do hífen
 *
 * Estes dois vetores apareceram no fuzz `parseTxDate-year-boundary-fuzz`
 * quando o gerador de ruído inseriu whitespace entre os separadores.
 * Antes do hardening, o parser caía silenciosamente no fallback porque a
 * regex de tokens exigia separador colado ao dígito.
 *
 * Invariantes verificados (idempotência + cycle-key determinístico):
 *   R1. `parseTxDate(input, fb)` retorna o mesmo timestamp em N chamadas.
 *   R2. O mês/dia extraídos coincidem com a leitura canônica (sem espaços).
 *   R3. A cycle key `YYYY-MM` casa com a de `getCycleDates(parsed, ...)`
 *       aplicada à forma canônica — para qualquer `closing_day`/`due_day`
 *       exercido, independente do `fallback` (a heurística Dez↔Jan é isolada
 *       fixando o fallback no mesmo mês do input).
 *   R4. Nenhuma chamada retorna NaN.
 */
import { describe, it, expect } from "vitest";
import { parseTxDate, getCycleDates } from "@/lib/invoice-utils";

type Case = {
  spaced: string;
  canonical: string;
  fallback: string; // ISO — mesmo mês do input para neutralizar heurística Dez↔Jan
  expectedMonth0: number; // 0-idx
  expectedDay: number;
};

const CASES: Case[] = [
  {
    spaced: "15 / 07",
    canonical: "15/07",
    fallback: "2026-07-20T12:00:00Z",
    expectedMonth0: 6,
    expectedDay: 15,
  },
  {
    spaced: "31 - 12",
    canonical: "31-12",
    fallback: "2026-12-05T12:00:00Z",
    expectedMonth0: 11,
    expectedDay: 31,
  },
];

const CYCLES: Array<{ closing: number; due: number }> = [
  { closing: 3, due: 10 },
  { closing: 15, due: 25 },
  { closing: 28, due: 5 },
];

const REPEAT = 5;

describe("parseTxDate — separadores espaçados (regressões pinadas)", () => {
  describe.each(CASES)("input='$spaced'", ({ spaced, canonical, fallback, expectedMonth0, expectedDay }) => {
    it("R1/R4 — idempotente e nunca NaN", () => {
      const timestamps = Array.from({ length: REPEAT }, () =>
        parseTxDate(spaced, fallback).getTime(),
      );
      for (const t of timestamps) {
        expect(Number.isNaN(t)).toBe(false);
      }
      expect(new Set(timestamps).size).toBe(1);
    });

    it("R2 — extrai o mesmo dia/mês da forma canônica", () => {
      const spacedDate = parseTxDate(spaced, fallback);
      const canonicalDate = parseTxDate(canonical, fallback);

      expect(spacedDate.getTime()).toBe(canonicalDate.getTime());
      expect(spacedDate.getMonth()).toBe(expectedMonth0);
      expect(spacedDate.getDate()).toBe(expectedDay);
    });

    it.each(CYCLES)(
      "R3 — cycle key coincide com canônica (closing=$closing due=$due)",
      ({ closing, due }) => {
        const spacedDate = parseTxDate(spaced, fallback);
        const canonicalDate = parseTxDate(canonical, fallback);

        const spacedCycle = getCycleDates(spacedDate, closing, due);
        const canonicalCycle = getCycleDates(canonicalDate, closing, due);

        // Comparação estrutural profunda: mesmas datas de fechamento e vencimento.
        expect(spacedCycle).toEqual(canonicalCycle);

        // Cycle key derivada do vencimento em formato YYYY-MM.
        const key = (d: Date) =>
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        expect(key(spacedCycle.currentDue)).toBe(key(canonicalCycle.currentDue));
      },
    );
  });
});
