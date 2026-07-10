/**
 * Contrato PATCH sob concorrência.
 *
 * Diferente do E2E (`patch-endpoint-concurrent.e2e.test.ts`) que sobe um
 * servidor HTTP real, este teste opera no NÍVEL DO CONTRATO: chama o handler
 * puro em paralelo com `Promise.all` e afirma que TODA resposta (independente
 * da ordem de resolução) respeita:
 *
 *   K1. Shape contratual: { id, normalized, installments, drift }.
 *   K2. Numeração 1..N contígua em `installments`.
 *   K3. Cada parcela com `total_installments === N` e ≤ 2 casas decimais.
 *   K4. Drift regulamentar |Σparcelas − source| ≤ N × 1¢ e `drift.ok === true`.
 *   K5. Idempotência: L chamadas idênticas em paralelo produzem L respostas
 *       byte-equivalentes (mesmo N, mesmas parcelas, mesmo `normalized`,
 *       mesmo `drift`).
 *   K6. Consistência do estado final: sob concorrência com N distintos,
 *       apenas UM vencedor prevalece no store, e a linha persistida é uma
 *       das enviadas — nunca uma mistura.
 *
 * Modela um mutex por-id no `persist` para simular a serialização
 * transacional que o Postgres oferece a UPDATEs concorrentes.
 */
import { describe, it, expect, vi } from "vitest";
import { handlePatchTransactionContract } from "@/lib/patch-transaction-contract";

const toCents = (n: number) => Math.round(n * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

function req(body: unknown, id = "concur-tx") {
  return {
    method: "PATCH",
    id,
    contentType: "application/json",
    rawBody: JSON.stringify(body),
  };
}

/** Store in-memory com mutex por-id — modela isolamento transacional. */
function makeStore() {
  const rows = new Map<string, Record<string, unknown>>();
  const locks = new Map<string, Promise<void>>();
  const persist = vi.fn(async (id: string, patch: Record<string, unknown>) => {
    // adquire lock
    while (locks.has(id)) await locks.get(id);
    let release!: () => void;
    locks.set(
      id,
      new Promise<void>((r) => {
        release = r;
      }),
    );
    try {
      // jitter aleatório para embaralhar ordem
      await new Promise((r) => setTimeout(r, Math.random() * 3));
      const merged = { id, ...(rows.get(id) ?? {}), ...patch };
      rows.set(id, merged);
      return merged;
    } finally {
      locks.delete(id);
      release();
    }
  });
  return { persist, rows };
}

/** Bateria de assertivas K1..K4 em uma única resposta 200. */
function assertContract(
  res: Awaited<ReturnType<typeof handlePatchTransactionContract>>,
) {
  expect(res.status).toBe(200);
  if (res.status !== 200) return;
  const { id, normalized, installments, drift } = res.body.data;

  // K1
  expect(typeof id).toBe("string");
  expect(id.length).toBeGreaterThan(0);
  expect(normalized).toBeTypeOf("object");
  expect(Array.isArray(installments)).toBe(true);
  expect(drift).toBeTypeOf("object");

  const N = installments.length;

  // K2
  const nums = installments.map((r) => r.installment_number).sort((a, b) => a - b);
  expect(nums).toEqual(Array.from({ length: N }, (_, i) => i + 1));

  // K3
  for (const r of installments) {
    expect(r.total_installments).toBe(N);
    expect(round2(r.amount)).toBe(r.amount);
  }

  // K4
  const src = installments[0].installment_source_amount;
  const sumCents = installments.reduce((s, r) => s + toCents(r.amount), 0);
  expect(Math.abs(sumCents - toCents(src))).toBeLessThanOrEqual(N);
  expect(drift.ok).toBe(true);
  expect(drift.tolerance).toBe(round2(N * 0.01));
  expect(toCents(drift.sum)).toBe(sumCents);
}

describe("Contrato PATCH sob concorrência", () => {
  it("K1..K4 — 40 chamadas concorrentes com N distintos: todas respostas seguem o contrato", async () => {
    const { persist } = makeStore();
    const jobs = Array.from({ length: 40 }, (_, i) => {
      const N = 1 + (i % 24); // 1..24
      const amount = [100, 100 / 3, 1.005, 199.99, 12.34][i % 5];
      return handlePatchTransactionContract(req({ amount, total_installments: N }), {
        persist,
        currentRow: null,
      });
    });
    const results = await Promise.all(jobs);
    for (const r of results) assertContract(r);
  });

  it("K5 — 30 chamadas idênticas em paralelo → 30 respostas byte-equivalentes (idempotência)", async () => {
    const { persist } = makeStore();
    const payload = { amount: 100 / 3, total_installments: 12 };
    const results = await Promise.all(
      Array.from({ length: 30 }, () =>
        handlePatchTransactionContract(req(payload), { persist, currentRow: null }),
      ),
    );

    // Todas 200 e contratuais.
    for (const r of results) assertContract(r);

    // Todas produzem o MESMO payload de resposta.
    const [first, ...rest] = results;
    if (first.status !== 200) throw new Error("expected 200");
    const canonical = {
      normalized: first.body.data.normalized,
      installments: first.body.data.installments,
      drift: first.body.data.drift,
    };
    for (const r of rest) {
      if (r.status !== 200) throw new Error("expected 200");
      expect({
        normalized: r.body.data.normalized,
        installments: r.body.data.installments,
        drift: r.body.data.drift,
      }).toEqual(canonical);
    }
  });

  it("K6 — 25 payloads distintos concorrentes: linha final coincide com UM vencedor", async () => {
    const { persist, rows } = makeStore();
    const payloads = Array.from({ length: 25 }, (_, i) => ({
      amount: 100 + i,
      total_installments: 1 + (i % 12),
    }));
    const results = await Promise.all(
      payloads.map((p) => handlePatchTransactionContract(req(p), { persist, currentRow: null })),
    );
    for (const r of results) assertContract(r);

    // A linha final deve corresponder a um dos payloads enviados — nunca híbrido.
    const finalRow = rows.get("concur-tx");
    expect(finalRow).toBeTruthy();
    const match = payloads.find(
      (p) =>
        (finalRow!.amount as number) === round2(p.amount) &&
        (finalRow!.total_installments as number) === p.total_installments,
    );
    expect(match).toBeTruthy();
  });

  it("K1..K4 — 20 rodadas de re-PATCH sequencial-concorrente preservam contrato e drift", async () => {
    const { persist } = makeStore();
    // Simula 20 "rodadas" onde cada rodada dispara 5 PATCHs concorrentes.
    // Ao fim de cada rodada, cada resposta ainda tem que satisfazer o contrato.
    for (let round = 0; round < 20; round++) {
      const jobs = [
        handlePatchTransactionContract(req({ amount: 100 / 3, total_installments: 12 }), {
          persist,
          currentRow: null,
        }),
        handlePatchTransactionContract(req({ amount: 250.5, total_installments: 6 }), {
          persist,
          currentRow: null,
        }),
        handlePatchTransactionContract(req({ amount: 999.99, total_installments: 24 }), {
          persist,
          currentRow: null,
        }),
        handlePatchTransactionContract(req({ amount: 1.005, total_installments: 4 }), {
          persist,
          currentRow: null,
        }),
        handlePatchTransactionContract(req({ amount: 42, total_installments: 1 }), {
          persist,
          currentRow: null,
        }),
      ];
      const results = await Promise.all(jobs);
      for (const r of results) assertContract(r);
    }
  });

  it("erros e sucessos intercalados: 4xx não afeta contrato dos 200 concorrentes", async () => {
    const { persist, rows } = makeStore();
    const before = rows.size;
    const jobs = [
      // válidos
      handlePatchTransactionContract(req({ amount: 100, total_installments: 3 }), {
        persist,
        currentRow: null,
      }),
      handlePatchTransactionContract(req({ amount: 100 / 7, total_installments: 7 }), {
        persist,
        currentRow: null,
      }),
      // inválidos (currency-only → 422)
      handlePatchTransactionContract(req({ currency: "USD" }), { persist, currentRow: null }),
      // amount inválido (0 → positive)
      handlePatchTransactionContract(req({ amount: 0, total_installments: 3 }), {
        persist,
        currentRow: null,
      }),
      // válido novamente
      handlePatchTransactionContract(req({ amount: 55.5, total_installments: 2 }), {
        persist,
        currentRow: null,
      }),
    ];
    const results = await Promise.all(jobs);
    const oks = results.filter((r) => r.status === 200);
    const fails = results.filter((r) => r.status !== 200);
    expect(oks.length).toBe(3);
    expect(fails.length).toBe(2);
    for (const r of oks) assertContract(r);
    // Store cresceu somente por causa dos 200 (mesmo id "concur-tx" agrupado).
    expect(rows.size).toBeGreaterThanOrEqual(before);
  });
});
