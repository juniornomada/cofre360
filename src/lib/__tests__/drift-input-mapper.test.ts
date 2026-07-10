/**
 * Testes unitários para o mapper `toDriftInput`.
 *
 * O mapper converte o output de um Zod parse (com `.passthrough()`,
 * `[key: string]: unknown`) em `InstallmentPreview[]` sem casts amplos
 * (TS2352), preservando os cinco campos obrigatórios do contrato:
 *   - installment_number, total_installments, amount,
 *     installment_source_amount, installment_mode.
 *
 * Cobre:
 *   T1. Conversão feliz: N parcelas → N InstallmentPreview idênticos.
 *   T2. Campos extras (`.passthrough()`) são descartados.
 *   T3. Tipos exatos: cada campo mantém `typeof number` / union literal.
 *   T4. Perda de campo obrigatório em installments → throw com índice.
 *   T5. `drift` completo → DriftMetric idêntico.
 *   T6. `drift` ausente ou incompleto → `undefined` (silencioso, nunca throw).
 *   T7. `data` ausente → `installments: []` e `drift: undefined`.
 *   T8. `installments` vazio → array vazio (não throw).
 *   T9. Idempotência: `toDriftInput(toDriftInput(x))` estruturalmente igual.
 *   T10. Não muta o input.
 */
import { describe, it, expect } from "vitest";
import {
  toDriftInput,
  narrowInstallment,
  narrowDrift,
  type RawDriftBody,
  type RawInstallmentRow,
} from "@/lib/drift-input-mapper";

const row = (
  n: number,
  total: number,
  amount: number,
  source: number,
  mode: "divide" | "fixed" = "divide",
  extras: Record<string, unknown> = {},
): RawInstallmentRow => ({
  installment_number: n,
  total_installments: total,
  amount,
  installment_source_amount: source,
  installment_mode: mode,
  ...extras,
});

describe("toDriftInput — mapper Zod→InstallmentPreview", () => {
  it("T1. converte N parcelas mantendo todos os 5 campos obrigatórios", () => {
    const body: RawDriftBody = {
      data: {
        installments: [
          row(1, 3, 33.34, 100),
          row(2, 3, 33.33, 100),
          row(3, 3, 33.33, 100),
        ],
      },
    };
    const out = toDriftInput(body);
    expect(out.data.installments).toHaveLength(3);
    expect(out.data.installments[0]).toEqual({
      installment_number: 1,
      total_installments: 3,
      amount: 33.34,
      installment_source_amount: 100,
      installment_mode: "divide",
    });
    // Chaves exatas — nada além do contrato.
    expect(Object.keys(out.data.installments[0]).sort()).toEqual(
      [
        "amount",
        "installment_mode",
        "installment_number",
        "installment_source_amount",
        "total_installments",
      ],
    );
  });

  it("T2. descarta campos extras vindos de .passthrough()", () => {
    const body: RawDriftBody = {
      data: {
        installments: [
          row(1, 1, 10, 10, "fixed", {
            future_field: "v3",
            server_metadata: { audit: "abc" },
            __proto__: { pwned: true },
          }),
        ],
      },
    };
    const out = toDriftInput(body);
    expect(Object.keys(out.data.installments[0])).not.toContain("future_field");
    expect(Object.keys(out.data.installments[0])).not.toContain("server_metadata");
    const probe = out.data.installments[0] as unknown as Record<string, unknown>;
    expect(probe.pwned).toBeUndefined();
  });

  it("T3. preserva tipos exatos (number / union literal)", () => {
    const body: RawDriftBody = {
      data: { installments: [row(1, 1, 42.5, 42.5, "fixed")] },
    };
    const p = toDriftInput(body).data.installments[0];
    expect(typeof p.installment_number).toBe("number");
    expect(typeof p.total_installments).toBe("number");
    expect(typeof p.amount).toBe("number");
    expect(typeof p.installment_source_amount).toBe("number");
    expect(p.installment_mode === "fixed" || p.installment_mode === "divide").toBe(true);
  });

  it("T4. lança erro identificando o índice e o campo faltante", () => {
    const bad: RawDriftBody = {
      data: {
        installments: [
          row(1, 2, 10, 20),
          // segundo item sem `amount`
          {
            installment_number: 2,
            total_installments: 2,
            installment_source_amount: 20,
            installment_mode: "divide",
          },
        ],
      },
    };
    expect(() => toDriftInput(bad)).toThrow(/installments\[1\]\.amount/);
  });

  it.each([
    ["installment_number"],
    ["total_installments"],
    ["amount"],
    ["installment_source_amount"],
    ["installment_mode"],
  ] as const)("T4b. cada campo obrigatório ausente é reportado: %s", (field) => {
    const base = row(1, 1, 10, 10);
    delete (base as Record<string, unknown>)[field];
    expect(() => narrowInstallment(base, 7)).toThrow(
      new RegExp(`installments\\[7\\]\\.${field}`),
    );
  });

  it("T5. preserva drift completo em DriftMetric", () => {
    const body: RawDriftBody = {
      data: {
        installments: [row(1, 1, 10, 10)],
        drift: { sum: 10, source: 10, delta: 0, tolerance: 0.01, ok: true, extra: "x" },
      },
    };
    const out = toDriftInput(body);
    expect(out.data.drift).toEqual({
      sum: 10,
      source: 10,
      delta: 0,
      tolerance: 0.01,
      ok: true,
    });
    // Extra descartado.
    expect(Object.keys(out.data.drift!)).not.toContain("extra");
  });

  it("T6. drift ausente/parcial retorna undefined (silencioso)", () => {
    expect(narrowDrift(undefined)).toBeUndefined();
    expect(narrowDrift({ sum: 1, source: 1, delta: 0, tolerance: 0.01 })).toBeUndefined();
    const body: RawDriftBody = { data: { installments: [row(1, 1, 5, 5)] } };
    expect(toDriftInput(body).data.drift).toBeUndefined();
  });

  it("T7. body sem `data` produz installments vazio e drift undefined", () => {
    const out = toDriftInput({});
    expect(out.data.installments).toEqual([]);
    expect(out.data.drift).toBeUndefined();
  });

  it("T8. installments vazio não lança erro", () => {
    const out = toDriftInput({ data: { installments: [] } });
    expect(out.data.installments).toEqual([]);
  });

  it("T9. idempotência estrutural quando re-alimentado", () => {
    const body: RawDriftBody = {
      data: {
        installments: [row(1, 2, 5, 10), row(2, 2, 5, 10)],
        drift: { sum: 10, source: 10, delta: 0, tolerance: 0.02, ok: true },
      },
    };
    const once = toDriftInput(body);
    const twice = toDriftInput(once as unknown as RawDriftBody);
    expect(twice).toEqual(once);
  });

  it("T10. não muta o input", () => {
    const body: RawDriftBody = {
      data: {
        installments: [row(1, 1, 10, 10, "divide", { extra: 1 })],
        drift: { sum: 10, source: 10, delta: 0, tolerance: 0.01, ok: true },
      },
    };
    const snapshot = JSON.parse(JSON.stringify(body));
    toDriftInput(body);
    expect(body).toEqual(snapshot);
  });

  it("T11. modo divide vs fixed é preservado independentemente", () => {
    const body: RawDriftBody = {
      data: {
        installments: [row(1, 2, 5, 10, "divide"), row(2, 2, 5, 10, "fixed")],
      },
    };
    const out = toDriftInput(body);
    expect(out.data.installments[0].installment_mode).toBe("divide");
    expect(out.data.installments[1].installment_mode).toBe("fixed");
  });
});
