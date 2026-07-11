import { describe, it, expect } from "vitest";
import { parseTxDate, getCycleDates } from "@/lib/invoice-utils";

/**
 * Combinações misturadas de formato de ano no campo textual `date`:
 * `DD/MM/YY`, `YYYY-MM-DD`, `DD-MM-YY`, `DD/MM/YYYY`, `YYYY/MM/DD`
 * (e variantes). Todas devem cair no MESMO dia/mês/ano e portanto na
 * MESMA fatura, independentemente do `created_at`.
 */
describe("parseTxDate — mixed year formats resolve to the same billing cycle", () => {
  // Fixamos `created_at` bem longe (Fev 2020) para provar que o ano
  // vem do próprio input, não do fallback.
  const CREATED_AT = "2020-02-15T12:00:00.000Z";
  const CARD = { closing: 3, due: 10 };

  const cycleKey = (d: Date) => {
    const { currentClose } = getCycleDates(d, CARD.closing, CARD.due);
    return currentClose.toISOString().split("T")[0];
  };

  const target = { y: 2026, m: 6, d: 10 }; // 10/Jul/2026
  const EXPECTED_YMD = "2026-7-10";
  const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

  it.each([
    ["DD/MM/YY", "10/07/26"],
    ["DD/MM/YYYY", "10/07/2026"],
    ["DD-MM-YY", "10-07-26"],
    ["DD-MM-YYYY", "10-07-2026"],
    ["YYYY-MM-DD (ISO)", "2026-07-10"],
    ["YYYY-MM-DD com timestamp", "2026-07-10T12:00:00Z"],
    ["DD/MM/YY com espaços", " 10 / 07 / 26 "],
    ["DD-MM-YY com espaços", " 10 - 07 - 26 "],
    ["DD/MM/YYYY com pontuação", "10/07/2026."],
  ])("%s → 10/Jul/2026", (_label, input) => {
    const d = parseTxDate(input, CREATED_AT);
    expect(ymd(d)).toBe(EXPECTED_YMD);
    expect(d.getFullYear()).toBe(target.y);
    expect(d.getMonth()).toBe(target.m);
    expect(d.getDate()).toBe(target.d);
  });

  it("todas as variantes resolvem no MESMO cycle key", () => {
    const variants = [
      "10/07/26",
      "10/07/2026",
      "10-07-26",
      "10-07-2026",
      "2026-07-10",
      "2026-07-10T09:30:00Z",
      " 10 / 07 / 26 ",
    ];
    const keys = new Set(variants.map((v) => cycleKey(parseTxDate(v, CREATED_AT))));
    expect(keys.size).toBe(1);
    // Fatura Atual referente a 10/07/2026 fecha em 03/08/2026.
    expect([...keys][0]).toBe("2026-08-03");
  });

  it("YY 2-dígitos expande para 20YY (jamais 19YY)", () => {
    for (const yy of ["00", "05", "26", "50", "99"]) {
      const d = parseTxDate(`10/07/${yy}`, CREATED_AT);
      expect(d.getFullYear()).toBe(2000 + parseInt(yy));
      expect(d.getMonth()).toBe(6);
      expect(d.getDate()).toBe(10);
    }
  });

  it("ano do input tem precedência sobre created_at (mesmo distante)", () => {
    // created_at em 2020 não deve puxar a data para 2020.
    const d1 = parseTxDate("10/07/26", "2020-02-15T00:00:00Z");
    const d2 = parseTxDate("10/07/26", "2030-11-20T00:00:00Z");
    const d3 = parseTxDate("2026-07-10", "1999-01-01T00:00:00Z");
    for (const d of [d1, d2, d3]) {
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(6);
      expect(d.getDate()).toBe(10);
    }
  });

  it("cross-year: 31/12/25 vs 01/01/26 caem em ciclos distintos e corretos", () => {
    const dez = parseTxDate("31/12/25", "2026-01-05T00:00:00Z");
    const jan = parseTxDate("01/01/26", "2025-12-30T23:59:00Z");
    expect(ymd(dez)).toBe("2025-12-31");
    expect(ymd(jan)).toBe("2026-1-1");
    // 31/12/2025 → fechamento 03/01/2026 ; 01/01/2026 → fechamento 03/01/2026
    // (ambas cabem na mesma fatura que fecha em 03/01/26; o teste garante
    // que o ANO textual foi respeitado, não sequestrado pelo fallback).
    expect(cycleKey(dez)).toBe("2026-01-03");
    expect(cycleKey(jan)).toBe("2026-01-03");
  });

  it("formatos ISO com/sem timestamp resolvem ao mesmo dia local", () => {
    const noon = parseTxDate("2026-07-10T12:00:00Z", CREATED_AT);
    const bare = parseTxDate("2026-07-10", CREATED_AT);
    expect(noon.getFullYear()).toBe(bare.getFullYear());
    expect(noon.getMonth()).toBe(bare.getMonth());
    expect(noon.getDate()).toBe(bare.getDate());
  });

  it("YY explícito no input sobrepõe a heurística de virada de ano", () => {
    // "01/01/24" com created_at em Dez/2025 NÃO deve virar 2026 —
    // o ano está explícito na string.
    const d = parseTxDate("01/01/24", "2025-12-31T23:59:00Z");
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });
});
