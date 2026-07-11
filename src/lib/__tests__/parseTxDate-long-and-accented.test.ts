import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseTxDate } from "@/lib/invoice-utils";

/**
 * `parseTxDate` should recognize:
 *   - Meses por extenso ("setembro", "março", "Fevereiro").
 *   - Abreviações com pontuação ("fev.", "mar,", "set.").
 *   - Tokens com acentos ("março", "Março", "MARÇO").
 *   - Combinações com espaços e capitalização mista.
 *
 * All variants must resolve to the same (day, monthIdx) pair as the
 * canonical short form ("07 mar"), reusing the created_at year.
 */

const FROZEN_NOW = new Date(Date.UTC(2026, 6, 15, 12, 0, 0)); // 15 Jul 2026
const FALLBACK = "2026-04-20T12:00:00Z"; // April 2026 → year=2026, month=Apr

describe("parseTxDate — long month names, punctuation and accents", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("month full names (pt-BR) map to the correct monthIdx", () => {
    const cases: Array<[string, number]> = [
      ["07 janeiro", 0],
      ["07 fevereiro", 1],
      ["07 março", 2],
      ["07 marco", 2], // sem acento
      ["07 abril", 3],
      ["07 maio", 4],
      ["07 junho", 5],
      ["07 julho", 6],
      ["07 agosto", 7],
      ["07 setembro", 8],
      ["07 outubro", 9],
      ["07 novembro", 10],
      ["07 dezembro", 11],
    ];
    it.each(cases)("%s → month %i", (input, expected) => {
      const d = parseTxDate(input, FALLBACK);
      expect(d.getMonth()).toBe(expected);
      expect(d.getDate()).toBe(7);
      expect(d.getFullYear()).toBe(2026);
    });
  });

  describe("short abbreviations with trailing pontuação", () => {
    const cases: Array<[string, number]> = [
      ["07 jan.", 0],
      ["07 fev.", 1],
      ["07 mar.", 2],
      ["07 abr.", 3],
      ["07 mai.", 4],
      ["07 jun.", 5],
      ["07 jul.", 6],
      ["07 ago.", 7],
      ["07 set.", 8],
      ["07 out.", 9],
      ["07 nov.", 10],
      ["07 dez.", 11],
      ["07 mar,", 2],
      ["07 set;", 8],
      ["07 nov:", 10],
    ];
    it.each(cases)("%s → month %i", (input, expected) => {
      const d = parseTxDate(input, FALLBACK);
      expect(d.getMonth()).toBe(expected);
      expect(d.getDate()).toBe(7);
    });
  });

  describe("accents and mixed capitalização", () => {
    it("'07 Março' → March", () => {
      expect(parseTxDate("07 Março", FALLBACK).getMonth()).toBe(2);
    });
    it("'07 MARÇO' → March", () => {
      expect(parseTxDate("07 MARÇO", FALLBACK).getMonth()).toBe(2);
    });
    it("'07 março' com acento agudo isolado → March", () => {
      expect(parseTxDate("07 mar\u00e7o", FALLBACK).getMonth()).toBe(2);
    });
    it("'07 Março.' com acento e ponto → March", () => {
      expect(parseTxDate("07 Março.", FALLBACK).getMonth()).toBe(2);
    });
    it("'07 Setembro' capitalizado → September", () => {
      expect(parseTxDate("07 Setembro", FALLBACK).getMonth()).toBe(8);
    });
    it("'07 SETEMBRO' maiúsculo → September", () => {
      expect(parseTxDate("07 SETEMBRO", FALLBACK).getMonth()).toBe(8);
    });
    it("'07 Fev.' com ponto e maiúscula → February", () => {
      expect(parseTxDate("07 Fev.", FALLBACK).getMonth()).toBe(1);
    });
  });

  describe("edge parity: full name and short form resolve identically", () => {
    const equivalents: Array<[string, string]> = [
      ["03 mar", "03 março"],
      ["03 mar", "03 Março"],
      ["03 fev", "03 fevereiro"],
      ["03 fev", "03 fev."],
      ["03 set", "03 setembro"],
      ["03 set", "03 Set."],
      ["03 dez", "03 dezembro"],
      ["03 jan", "03 janeiro"],
    ];
    it.each(equivalents)("%s === %s", (canonical, variant) => {
      const a = parseTxDate(canonical, FALLBACK);
      const b = parseTxDate(variant, FALLBACK);
      expect(b.getTime()).toBe(a.getTime());
    });
  });

  describe("year-boundary heuristic still fires with long names", () => {
    it("'02 janeiro' + created_at Dez 2026 → 2027", () => {
      const d = parseTxDate("02 janeiro", "2026-12-31T23:59:00Z");
      expect(d.getFullYear()).toBe(2027);
      expect(d.getMonth()).toBe(0);
      expect(d.getDate()).toBe(2);
    });
    it("'31 dezembro' + created_at Jan 2027 → 2026", () => {
      const d = parseTxDate("31 dezembro", "2027-01-03T00:00:00Z");
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(11);
      expect(d.getDate()).toBe(31);
    });
    it("'02 Março' mid-year → no year shift", () => {
      const d = parseTxDate("02 Março", FALLBACK);
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(2);
    });
  });

  describe("unrelated words are NOT accepted as months", () => {
    // "janela" starts with "jan" but is not a month — must fall back.
    it("'07 janela' → falls back to created_at year/month", () => {
      const d = parseTxDate("07 janela", FALLBACK);
      // Falls back to the fallback date (Apr 20 2026), NOT Jan 7.
      expect(d.getUTCMonth()).toBe(3);
      expect(d.getUTCDate()).toBe(20);
    });
    it("'07 marte' → falls back (not March)", () => {
      const d = parseTxDate("07 marte", FALLBACK);
      expect(d.getUTCMonth()).toBe(3); // Apr from fallback
    });
    it("'07 setembrooo' typo → falls back", () => {
      const d = parseTxDate("07 setembrooo", FALLBACK);
      expect(d.getUTCMonth()).toBe(3);
    });
  });
});
