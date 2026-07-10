/**
 * Regressão — idempotência do PATCH após persistir (arredondamento extremo).
 *
 * Para CADA payload de arredondamento extremo, envia o PATCH duas vezes contra
 * o MESMO id (a segunda requisição vê a linha já persistida pela primeira).
 *
 * Garante que:
 *   R1. status === 200 nas duas chamadas.
 *   R2. `data.installments` é IDÊNTICO (deep-equal) entre 1ª e 2ª execução.
 *   R3. `data.drift` é IDÊNTICO (sum, source, delta, tolerance, ok).
 *   R4. `data.normalized` (payload saneado) é IDÊNTICO.
 *   R5. A linha persistida após a 2ª chamada é IGUAL à persistida após a 1ª
 *       (nenhum campo cosmético/estrutural muda em replays).
 *   R6. A distribuição do centavo permanece consistente (|Σ − source| ≤ N¢).
 *
 * Regressão específica: um bug clássico é acumular drift a cada replay
 * (source cresce, delta cresce, parcelas mudam). Este teste travaria imediato.
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

function req(body: unknown, id: string) {
  return {
    method: "PATCH",
    id,
    contentType: "application/json",
    rawBody: JSON.stringify(body),
  };
}

/** Mini "banco" que persiste a linha e é usado como currentRow no replay. */
function makeStore() {
  const rows = new Map<
    string,
    {
      id: string;
      amount: number;
      total_installments: number;
      installment_mode?: "divide" | "fixed";
      installment_source_amount?: number;
      [k: string]: unknown;
    }
  >();

  const persist = vi.fn(async (id: string, patch: Record<string, unknown>) => {
    const prev = rows.get(id) ?? { id, amount: 0, total_installments: 1 };
    const next = { ...prev, ...patch, id };
    rows.set(id, next);
    return next;
  });

  const getCurrent = (id: string) => {
    const r = rows.get(id);
    if (!r) return null;
    return {
      amount: r.amount,
      total_installments: r.total_installments,
      installment_mode: r.installment_mode,
      installment_source_amount: r.installment_source_amount,
    };
  };

  return { rows, persist, getCurrent };
}

async function patchTwice(body: unknown, id: string): Promise<{ first: OkData; second: OkData; rowAfter1: unknown; rowAfter2: unknown }> {
  const store = makeStore();

  const r1 = await handlePatchTransactionContract(req(body, id), {
    persist: store.persist,
    currentRow: store.getCurrent(id),
  });
  if (r1.status !== 200) throw new Error(`1ª chamada não-200: ${JSON.stringify(r1)}`);
  const rowAfter1 = structuredClone(store.rows.get(id));

  const r2 = await handlePatchTransactionContract(req(body, id), {
    persist: store.persist,
    currentRow: store.getCurrent(id),
  });
  if (r2.status !== 200) throw new Error(`2ª chamada não-200: ${JSON.stringify(r2)}`);
  const rowAfter2 = structuredClone(store.rows.get(id));

  return { first: r1.body.data, second: r2.body.data, rowAfter1, rowAfter2 };
}

/** Casos de arredondamento extremo cobrindo sub-cent, half-up, dízimas, altos, N grandes. */
const cases: Array<{ label: string; body: Record<string, unknown>; expectN: number }> = [
  { label: "sub-cent 0.001 / N=1", body: { amount: 0.001, total_installments: 1 }, expectN: 1 },
  { label: "sub-cent 0.004 / N=3", body: { amount: 0.004, total_installments: 3 }, expectN: 3 },
  { label: "sub-cent 0.009 / N=12", body: { amount: 0.009, total_installments: 12 }, expectN: 12 },
  { label: "half-up 1.005 / N=1", body: { amount: 1.005, total_installments: 1 }, expectN: 1 },
  { label: "half-up 2.675 / N=1", body: { amount: 2.675, total_installments: 1 }, expectN: 1 },
  { label: "half-up 0.015 / N=3", body: { amount: 0.015, total_installments: 3 }, expectN: 3 },
  { label: "half-up 999.995 / N=7", body: { amount: 999.995, total_installments: 7 }, expectN: 7 },
  { label: "dízima 100 / N=3", body: { amount: 100, total_installments: 3 }, expectN: 3 },
  { label: "dízima 100 / N=6", body: { amount: 100, total_installments: 6 }, expectN: 6 },
  { label: "dízima 100 / N=7", body: { amount: 100, total_installments: 7 }, expectN: 7 },
  { label: "dízima 100 / N=9", body: { amount: 100, total_installments: 9 }, expectN: 9 },
  { label: "alto 9999999.99 / N=12", body: { amount: 9_999_999.99, total_installments: 12 }, expectN: 12 },
  { label: "alto 1234567.89 / N=7", body: { amount: 1_234_567.89, total_installments: 7 }, expectN: 7 },
  { label: "alto 500000.55 / N=24", body: { amount: 500_000.55, total_installments: 24 }, expectN: 24 },
  { label: "float phantom 0.1+0.2 / N=3", body: { amount: 0.1 + 0.2, total_installments: 3 }, expectN: 3 },
  { label: "N máximo 100/36", body: { amount: 100, total_installments: 36 }, expectN: 36 },
  { label: "N=1 trivial 33.33", body: { amount: 33.33, total_installments: 1 }, expectN: 1 },
  {
    label: "com cosméticos + dízima",
    body: { amount: 100, total_installments: 7, name: "  Sorvete  ", category: "Alimentação", icon: null },
    expectN: 7,
  },
];

describe("Regressão — PATCH x2 idempotente com arredondamento extremo", () => {
  it.each(cases)("$label: 2ª chamada é idêntica à 1ª (installments, drift, normalized, linha persistida)", async ({ body, expectN }) => {
    const id = `rr-${JSON.stringify(body)}`;
    const { first, second, rowAfter1, rowAfter2 } = await patchTwice(body, id);

    // R1 — status já validado em patchTwice()

    // R2 — installments deep-equal
    expect(second.installments).toEqual(first.installments);
    expect(second.installments).toHaveLength(expectN);

    // R3 — drift deep-equal
    expect(second.drift).toEqual(first.drift);

    // R4 — normalized deep-equal
    expect(second.normalized).toEqual(first.normalized);

    // R5 — linha persistida idêntica entre replays
    expect(rowAfter2).toEqual(rowAfter1);

    // R6 — distribuição do centavo dentro da tolerância nas DUAS chamadas
    for (const data of [first, second]) {
      const sum = round2(data.installments.reduce((s, r) => s + r.amount, 0));
      expect(data.drift.sum).toBe(sum);
      expect(data.drift.tolerance).toBe(round2(expectN * CENT));
      const diffCents = Math.round(Math.abs(sum - data.drift.source) * 100);
      expect(diffCents).toBeLessThanOrEqual(expectN);
      expect(data.drift.ok).toBe(true);
      // parcelas com ≤ 2 casas
      for (const r of data.installments) {
        expect(Math.round(r.amount * 100) / 100).toBe(r.amount);
      }
    }
  });

  it("regressão: source NÃO acumula em N replays (5×) com dízima 100/7", async () => {
    const store = makeStore();
    const body = { amount: 100, total_installments: 7 };
    const id = "rr-noaccumulate";

    let previous: OkData | null = null;
    for (let i = 0; i < 5; i++) {
      const res = await handlePatchTransactionContract(req(body, id), {
        persist: store.persist,
        currentRow: store.getCurrent(id),
      });
      expect(res.status).toBe(200);
      const data = (res as { status: 200; body: OkBody }).body.data;
      if (previous) {
        expect(data.installments).toEqual(previous.installments);
        expect(data.drift).toEqual(previous.drift);
      }
      // source SEMPRE = round2(100 * 7) = 700.00 em todo replay
      expect(data.drift.source).toBe(700);
      previous = data;
    }
  });

  it("regressão: modo fixed persistido mantém drift=0 em replays consecutivos", async () => {
    const store = makeStore();
    const id = "rr-fixed";
    // seed direto na loja simulando linha em modo fixed
    store.rows.set(id, { id, amount: 33.33, total_installments: 3, installment_mode: "fixed" });

    let prev: OkData | null = null;
    for (let i = 0; i < 4; i++) {
      const res = await handlePatchTransactionContract(req({ amount: 33.33 }, id), {
        persist: store.persist,
        currentRow: store.getCurrent(id),
      });
      expect(res.status).toBe(200);
      const data = (res as { status: 200; body: OkBody }).body.data;
      expect(data.drift.delta).toBe(0);
      expect(data.drift.sum).toBe(round2(33.33 * 3));
      if (prev) {
        expect(data.installments).toEqual(prev.installments);
        expect(data.drift).toEqual(prev.drift);
      }
      prev = data;
    }
  });
});
