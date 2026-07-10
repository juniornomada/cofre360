/**
 * Meta-teste: garante que `fcAssertWithRepro` emite um bloco de reprodução
 * detalhado (seed + path + counterexample encolhido + snippets de repro)
 * quando uma propriedade falha, e permanece silencioso quando passa.
 *
 * Isso protege a experiência de debug: se alguém trocar o helper por
 * `fc.assert` puro no futuro, este teste falha imediatamente.
 */
import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { fcAssertWithRepro } from "./helpers/fc-assert";

describe("fcAssertWithRepro", () => {
  it("passa silenciosamente quando a propriedade é verdadeira", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await fcAssertWithRepro(
      fc.property(fc.integer(), (n) => Number.isInteger(n)),
      { label: "sanity", numRuns: 20 },
    );
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("ao falhar, imprime seed, path, numRuns, counterexample encolhido e snippets", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Propriedade intencionalmente falsa: existe pelo menos um inteiro > 10.
    // fast-check encontra e ENCOLHE para o menor contraexemplo — tipicamente 11.
    let threw = false;
    try {
      await fcAssertWithRepro(
        fc.property(fc.integer({ min: 0, max: 1000 }), (n) => {
          expect(n).toBeLessThanOrEqual(10);
        }),
        { label: "regressão-simulada", numRuns: 300, seed: 42 },
      );
    } catch (e) {
      threw = true;
      // A mensagem curta do throw referencia o seed para localização rápida.
      expect(String((e as Error).message)).toMatch(/regressão-simulada/);
      expect(String((e as Error).message)).toMatch(/seed=/);
    }
    expect(threw).toBe(true);

    // Consolida todo o output em uma única string para inspeção.
    const dumped = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    errSpy.mockRestore();

    // Cabeçalho e todos os campos essenciais de reprodução.
    expect(dumped).toMatch(/FUZZ FAILED — regressão-simulada/);
    expect(dumped).toMatch(/seed\s*:/);
    expect(dumped).toMatch(/path\s*:/);
    expect(dumped).toMatch(/numRuns\s*:/);
    expect(dumped).toMatch(/numShrinks\s*:/);
    expect(dumped).toMatch(/shrunk counterexample:/);

    // O counterexample deve ter sido encolhido para um número BAIXO — no
    // extremo, 11 (primeiro inteiro que viola o predicado). O banner usa
    // prefixo `│ ` em cada linha; procuramos o primeiro inteiro após o
    // marcador do counterexample.
    const idx = dumped.indexOf("shrunk counterexample");
    expect(idx).toBeGreaterThanOrEqual(0);
    const tail = dumped.slice(idx);
    const ceMatch = tail.match(/(-?\d+)/);
    expect(ceMatch, "não achei o counterexample encolhido no output").not.toBeNull();
    if (ceMatch) {
      const shrunk = Number(ceMatch[1]);
      expect(Number.isFinite(shrunk)).toBe(true);
      // 300 runs a partir de seed=42 devem encolher confortavelmente para <= 30.
      expect(Math.abs(shrunk)).toBeLessThanOrEqual(30);
    }


    // Bloco copy-paste para reprodução via env vars e via código.
    expect(dumped).toMatch(/FC_SEED=/);
    expect(dumped).toMatch(/bunx vitest run/);
    expect(dumped).toMatch(/await fcAssertWithRepro\(prop,/);
    expect(dumped).toMatch(/endOnFailure:\s*true/);
  });

  it("FC_SEED / FC_PATH via env sobrescrevem o seed passado no código", async () => {
    // Fixamos um seed no código e outro no env; o env deve vencer, e o
    // banner reportado deve conter o seed do env — permitindo repro rápida.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const originalSeed = process.env.FC_SEED;
    process.env.FC_SEED = "987654";

    try {
      await fcAssertWithRepro(
        fc.property(fc.integer({ min: 0, max: 5 }), (n) => n < 0),
        { label: "env-override", numRuns: 10, seed: 1 },
      );
    } catch {
      /* esperado */
    } finally {
      if (originalSeed === undefined) delete process.env.FC_SEED;
      else process.env.FC_SEED = originalSeed;
    }

    const dumped = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    errSpy.mockRestore();
    expect(dumped).toMatch(/seed\s*:\s*987654/);
    expect(dumped).toMatch(/FC_SEED=987654/);
  });
});
