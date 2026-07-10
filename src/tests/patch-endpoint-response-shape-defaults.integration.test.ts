/**
 * Contrato PATCH — shape completo da resposta 200 + defaults por omissão.
 *
 * Garante que TODA resposta 200 contenha:
 *   • body.data.id           (== request.id)
 *   • body.data.normalized   (somente allowlist; ausentes NÃO aparecem)
 *   • body.data.installments (array com N linhas)
 *   • body.data.drift        (sum, source, delta, tolerance, ok)
 *
 * E que campos ausentes no request entrem com os defaults esperados:
 *   • sem currentRow e sem amount/N       → N=1, mode="divide", source=0
 *   • patch cosmético c/ currentRow       → herda amount/N/mode/source do row
 *   • só amount                            → N herda do row (ou 1)
 *   • só total_installments                → amount/source herdam do row
 *   • installment_mode ausente             → "divide"
 *   • installment_source_amount ausente    → round2(amount × N)
 */
import { describe, it, expect, vi } from "vitest";
import {
  handlePatchTransactionContract,
  type PatchContractResponse,
} from "@/lib/patch-transaction-contract";

const CENT = 0.01;
const round2 = (n: number) => Math.round(n * 100) / 100;

type OkBody = Extract<PatchContractResponse, { status: 200 }>["body"];
type OkData = OkBody["data"];

const ALLOWED_NORMALIZED = new Set([
  "name",
  "amount",
  "total_installments",
  "date",
  "category",
  "icon",
  "card",
  "bank_account_id",
]);

const DRIFT_KEYS = ["sum", "source", "delta", "tolerance", "ok"] as const;
const DATA_KEYS = ["id", "normalized", "installments", "drift"] as const;

function req(body: unknown, id = "tx-shape") {
  return {
    method: "PATCH",
    id,
    contentType: "application/json",
    rawBody: JSON.stringify(body),
  };
}

async function patchOk(
  body: unknown,
  currentRow:
    | {
        amount: number;
        total_installments: number;
        installment_mode?: "divide" | "fixed";
        installment_source_amount?: number;
      }
    | null = null,
  id = "tx-shape",
): Promise<OkData> {
  const persist = vi.fn(async (rid: string, patch: Record<string, unknown>) => ({ id: rid, ...patch }));
  const res = await handlePatchTransactionContract(req(body, id), { persist, currentRow });
  if (res.status !== 200) throw new Error(`esperava 200, recebi ${res.status}: ${JSON.stringify(res)}`);
  return res.body.data;
}

/** Asserts estruturais fortes: chaves exatas + tipos + coerência. */
function assertResponseShape(data: OkData, expectedId: string) {
  // top-level keys — exatamente estas, nada mais, nada menos.
  expect(Object.keys(data).sort()).toEqual([...DATA_KEYS].sort());

  // id
  expect(typeof data.id).toBe("string");
  expect(data.id).toBe(expectedId);

  // normalized: objeto plano, chaves só do allowlist
  expect(data.normalized).toBeTypeOf("object");
  expect(data.normalized).not.toBeNull();
  expect(Array.isArray(data.normalized)).toBe(false);
  for (const k of Object.keys(data.normalized)) {
    expect(ALLOWED_NORMALIZED.has(k), `chave normalized não permitida: ${k}`).toBe(true);
  }

  // installments: array não-vazio, itens com shape fixo
  expect(Array.isArray(data.installments)).toBe(true);
  expect(data.installments.length).toBeGreaterThanOrEqual(1);
  for (const r of data.installments) {
    expect(Object.keys(r).sort()).toEqual(
      [
        "installment_number",
        "total_installments",
        "amount",
        "installment_source_amount",
        "installment_mode",
      ].sort(),
    );
    expect(typeof r.installment_number).toBe("number");
    expect(typeof r.total_installments).toBe("number");
    expect(typeof r.amount).toBe("number");
    expect(typeof r.installment_source_amount).toBe("number");
    expect(["divide", "fixed"]).toContain(r.installment_mode);
  }

  // drift: shape exato
  expect(Object.keys(data.drift).sort()).toEqual([...DRIFT_KEYS].sort());
  expect(typeof data.drift.sum).toBe("number");
  expect(typeof data.drift.source).toBe("number");
  expect(typeof data.drift.delta).toBe("number");
  expect(typeof data.drift.tolerance).toBe("number");
  expect(typeof data.drift.ok).toBe("boolean");

  // coerência de drift com installments
  const sum = round2(data.installments.reduce((s, r) => s + r.amount, 0));
  expect(data.drift.sum).toBe(sum);
  expect(data.drift.tolerance).toBe(round2(data.installments.length * CENT));
  expect(data.drift.delta).toBeLessThanOrEqual(data.drift.tolerance + 1e-9);
  expect(data.drift.ok).toBe(true);
}

describe("Contrato PATCH — shape completo da resposta 200", () => {
  it("resposta contém EXATAMENTE {id, normalized, installments, drift}", async () => {
    const data = await patchOk({ amount: 100, total_installments: 3 }, null, "tx-A");
    assertResponseShape(data, "tx-A");
    expect(data.installments).toHaveLength(3);
  });

  it("id da resposta espelha o id da requisição", async () => {
    const ids = ["tx-1", "abc-xyz", "uuid-9f00", "id-com-espaço"];
    for (const id of ids) {
      const data = await patchOk({ amount: 10, total_installments: 2 }, null, id);
      assertResponseShape(data, id);
    }
  });

  it("normalized inclui SOMENTE chaves enviadas (ausentes não aparecem)", async () => {
    const data = await patchOk({ amount: 50, total_installments: 2 });
    expect(data.normalized).toEqual({ amount: 50, total_installments: 2 });
    for (const absent of ["name", "date", "category", "icon", "card", "bank_account_id"]) {
      expect(data.normalized).not.toHaveProperty(absent);
    }
  });

  it("normalized preserva null explícito e NÃO invents defaults cosméticos", async () => {
    const data = await patchOk({
      amount: 10,
      total_installments: 1,
      icon: null,
      bank_account_id: null,
    });
    expect(data.normalized.icon).toBeNull();
    expect(data.normalized.bank_account_id).toBeNull();
    expect(data.normalized).not.toHaveProperty("name");
    expect(data.normalized).not.toHaveProperty("category");
    expect(data.normalized).not.toHaveProperty("card");
  });
});

describe("Contrato PATCH — defaults quando campos estão ausentes", () => {
  it("sem currentRow e sem amount/N → N=1, mode='divide', source=0, 1 parcela em 0", async () => {
    const data = await patchOk({ name: "Só nome" }, null);
    assertResponseShape(data, "tx-shape");
    expect(data.installments).toHaveLength(1);
    expect(data.installments[0]).toMatchObject({
      installment_number: 1,
      total_installments: 1,
      amount: 0,
      installment_source_amount: 0,
      installment_mode: "divide",
    });
    expect(data.drift).toEqual({ sum: 0, source: 0, delta: 0, tolerance: 0.01, ok: true });
  });

  it("patch cosmético + currentRow → herda amount/N/mode/source do row", async () => {
    const data = await patchOk(
      { category: "Alimentação" },
      { amount: 33.33, total_installments: 3, installment_mode: "divide", installment_source_amount: 99.99 },
    );
    assertResponseShape(data, "tx-shape");
    expect(data.normalized).toEqual({ category: "Alimentação" });
    expect(data.installments).toHaveLength(3);
    for (const r of data.installments) {
      expect(r.installment_source_amount).toBe(99.99);
      expect(r.installment_mode).toBe("divide");
      expect(r.total_installments).toBe(3);
    }
  });

  it("só amount → N herda do currentRow (ou 1 se ausente)", async () => {
    const data = await patchOk(
      { amount: 20 },
      { amount: 10, total_installments: 5 },
    );
    expect(data.normalized).toEqual({ amount: 20 });
    expect(data.installments).toHaveLength(5);
    expect(data.drift.source).toBe(round2(20 * 5));
  });

  it("só total_installments → amount/source herdam do currentRow", async () => {
    const data = await patchOk(
      { total_installments: 7 },
      { amount: 33.33, total_installments: 3, installment_source_amount: 99.99 },
    );
    expect(data.normalized).toEqual({ total_installments: 7 });
    expect(data.installments).toHaveLength(7);
    expect(data.drift.source).toBe(99.99);
  });

  it("installment_mode ausente no currentRow → default 'divide'", async () => {
    const data = await patchOk(
      { amount: 15 },
      { amount: 10, total_installments: 2 },
    );
    for (const r of data.installments) expect(r.installment_mode).toBe("divide");
  });

  it("currentRow SEM installment_source_amount → source = round2(amount × N)", async () => {
    const data = await patchOk(
      { category: "X" },
      { amount: 12.5, total_installments: 4 }, // sem source explícito
    );
    expect(data.drift.source).toBe(round2(12.5 * 4));
    expect(data.installments[0].installment_source_amount).toBe(round2(12.5 * 4));
  });

  it("mode 'fixed' no currentRow é preservado quando patch é cosmético", async () => {
    const data = await patchOk(
      { name: "Assinatura" },
      { amount: 29.9, total_installments: 12, installment_mode: "fixed" },
    );
    for (const r of data.installments) expect(r.installment_mode).toBe("fixed");
    expect(data.drift.delta).toBe(0);
    expect(data.drift.sum).toBe(round2(29.9 * 12));
  });

  it("resposta 200 SEMPRE traz as 4 chaves de data, mesmo com body vazio de valores válidos", async () => {
    // apenas um campo cosmético — o mínimo para o handler aceitar
    const data = await patchOk({ name: "  ok  " });
    assertResponseShape(data, "tx-shape");
    expect(data.normalized).toEqual({ name: "ok" }); // trim aplicado
    expect(data.installments.length).toBe(1); // default N=1 sem currentRow
    expect(data.drift.ok).toBe(true);
  });
});
