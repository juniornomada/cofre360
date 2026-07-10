/**
 * Contrato — endpoint PATCH sempre devolve payload normalizado + parcelas
 * recalculadas + métrica de drift dentro do limite (N × 1¢).
 *
 * O teste valida o CONTRATO da resposta 200, não a persistência:
 *   - `data.id`                     — id da transação alterada
 *   - `data.normalized`             — patch pós-saneamento (só chaves do allowlist)
 *   - `data.installments`           — N linhas com amount, source, mode, numeração 1..N
 *   - `data.drift`                  — { sum, source, delta, tolerance, ok } com delta ≤ tolerance
 */
import { describe, it, expect, vi } from "vitest";
import {
  handlePatchTransactionContract,
  type PatchContractResponse,
} from "@/lib/patch-transaction-contract";

const CENT = 0.01;
const round2 = (n: number) => Math.round(n * 100) / 100;

type OkBody = Extract<PatchContractResponse, { status: 200 }>["body"];

function req(body: unknown, id = "tx-1") {
  return {
    method: "PATCH",
    id,
    contentType: "application/json",
    rawBody: JSON.stringify(body),
  };
}

function persistEcho() {
  return vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch }));
}

function assertContractShape(body: OkBody, expectedN: number) {
  expect(body).toHaveProperty("data");
  const d = body.data;
  expect(typeof d.id).toBe("string");
  expect(d.id.length).toBeGreaterThan(0);

  // normalized: só chaves do allowlist
  const allowed = new Set([
    "name",
    "amount",
    "total_installments",
    "date",
    "category",
    "icon",
    "card",
    "bank_account_id",
  ]);
  for (const k of Object.keys(d.normalized)) {
    expect(allowed.has(k), `chave ${k} fora do allowlist`).toBe(true);
  }

  // installments: N linhas, numeração 1..N, valores >= 0
  expect(Array.isArray(d.installments)).toBe(true);
  expect(d.installments).toHaveLength(expectedN);
  const nums = d.installments.map((r) => r.installment_number).sort((a, b) => a - b);
  expect(nums).toEqual(Array.from({ length: expectedN }, (_, i) => i + 1));
  for (const row of d.installments) {
    expect(row.total_installments).toBe(expectedN);
    expect(row.installment_source_amount).toBe(d.installments[0].installment_source_amount);
    expect(row.installment_mode).toBe(d.installments[0].installment_mode);
    expect(round2(row.amount)).toBe(row.amount);
    expect(row.amount).toBeGreaterThanOrEqual(0);
  }

  // drift: delta <= tolerance, ok=true, e coerente com sum/source
  expect(d.drift.ok).toBe(true);
  expect(d.drift.tolerance).toBeCloseTo(expectedN * CENT, 10);
  expect(d.drift.delta).toBeLessThanOrEqual(d.drift.tolerance + 1e-9);
  const recomputedSum = round2(d.installments.reduce((s, r) => s + r.amount, 0));
  expect(recomputedSum).toBeCloseTo(d.drift.sum, 10);
}

describe("PATCH contract — normalized payload + parcelas recalculadas + drift dentro do limite", () => {
  const currentRow = {
    amount: round2(1000 / 12),
    total_installments: 12,
    installment_mode: "divide" as const,
    installment_source_amount: 1000,
  };

  it("patch cosmético (só category): normaliza, mantém N/source da linha atual, drift ok", async () => {
    const resp = await handlePatchTransactionContract(req({ category: "Alimentação" }), {
      currentRow,
      persist: persistEcho(),
    });
    expect(resp.status).toBe(200);
    if (resp.status !== 200) return;
    const b = resp.body;
    expect(Object.keys(b.data.normalized)).toEqual(["category"]);
    expect(b.data.normalized.category).toBe("Alimentação");
    expect(b.data.drift.source).toBe(1000);
    assertContractShape(b, 12);
  });

  it("patch estrutural (só amount): source = amount × N atual, parcelas iguais", async () => {
    const resp = await handlePatchTransactionContract(req({ amount: 200 }), {
      currentRow,
      persist: persistEcho(),
    });
    expect(resp.status).toBe(200);
    if (resp.status !== 200) return;
    const b = resp.body;
    expect(b.data.normalized.amount).toBe(200);
    expect(b.data.drift.source).toBe(2400); // 200 × 12
    for (const r of b.data.installments) expect(r.amount).toBe(200);
    assertContractShape(b, 12);
  });

  it("patch estrutural (só total_installments): source original preservada", async () => {
    const resp = await handlePatchTransactionContract(req({ total_installments: 5 }), {
      currentRow,
      persist: persistEcho(),
    });
    expect(resp.status).toBe(200);
    if (resp.status !== 200) return;
    const b = resp.body;
    expect(b.data.normalized.total_installments).toBe(5);
    expect(b.data.drift.source).toBe(1000);
    for (const r of b.data.installments) expect(r.amount).toBe(200);
    assertContractShape(b, 5);
  });

  it("patch com dízima (100/3): drift natural ≤ 3¢ e ok=true", async () => {
    const resp = await handlePatchTransactionContract(
      req({ amount: round2(100 / 3), total_installments: 3 }),
      { currentRow, persist: persistEcho() },
    );
    expect(resp.status).toBe(200);
    if (resp.status !== 200) return;
    const b = resp.body;
    expect(b.data.normalized.amount).toBe(33.33);
    expect(b.data.drift.source).toBe(99.99);
    expect(b.data.drift.delta).toBeLessThanOrEqual(3 * CENT + 1e-9);
    assertContractShape(b, 3);
  });

  it("chaves fora do allowlist não aparecem em `normalized`", async () => {
    const resp = await handlePatchTransactionContract(
      req({ category: "X", id: "hack", user_id: "y", is_admin: true }),
      { currentRow, persist: persistEcho() },
    );
    expect(resp.status).toBe(200);
    if (resp.status !== 200) return;
    expect(Object.keys(resp.body.data.normalized)).toEqual(["category"]);
    assertContractShape(resp.body, 12);
  });

  it("normalização aplica trim/round2 antes de expor em `normalized`", async () => {
    const resp = await handlePatchTransactionContract(
      req({ name: "  Compra  ", amount: 33.333, total_installments: 3 }),
      { currentRow, persist: persistEcho() },
    );
    expect(resp.status).toBe(200);
    if (resp.status !== 200) return;
    expect(resp.body.data.normalized.name).toBe("Compra");
    expect(resp.body.data.normalized.amount).toBe(33.33);
    assertContractShape(resp.body, 3);
  });

  it("varredura paramétrica: para N ∈ {1..36} o drift sempre respeita a tolerância", async () => {
    for (let n = 1; n <= 36; n++) {
      const resp = await handlePatchTransactionContract(
        req({ amount: round2(100 / 3), total_installments: n }),
        { currentRow, persist: persistEcho() },
      );
      expect(resp.status, `N=${n}`).toBe(200);
      if (resp.status !== 200) continue;
      const b = resp.body;
      expect(b.data.drift.ok, `N=${n}`).toBe(true);
      expect(b.data.drift.delta).toBeLessThanOrEqual(n * CENT + 1e-9);
      expect(b.data.installments).toHaveLength(n);
    }
  });

  it("erros (422) NÃO carregam o shape de contrato — mantêm o shape de erro", async () => {
    const resp = await handlePatchTransactionContract(req({ amount: -5 }), {
      currentRow,
      persist: persistEcho(),
    });
    expect(resp.status).toBe(422);
    if (resp.status === 200) return;
    expect(resp.body).toHaveProperty("error");
    expect((resp.body as { data?: unknown }).data).toBeUndefined();
  });
});
