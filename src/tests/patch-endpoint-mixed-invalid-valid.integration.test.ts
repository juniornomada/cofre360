/**
 * PATCH — intercalar payloads 422 com 200 concorrentes.
 *
 * Garante que payloads INVÁLIDOS (que devem retornar 422) NUNCA aplicam
 * escrita parcial, mesmo quando disparados em paralelo com payloads
 * VÁLIDOS ao MESMO id. Ao final, o estado persistido:
 *
 *   X1. Contém EXCLUSIVAMENTE valores originados de algum payload válido —
 *       nunca fragmentos (ex.: N do inválido + amount do válido).
 *   X2. Cada 422 devolve shape de erro contratual e NÃO invoca `persist`.
 *   X3. Cada 200 devolve contrato `{id, normalized, installments, drift}`
 *       com numeração 1..N e drift regulamentar.
 *   X4. O número de escritas em `persist` é EXATAMENTE igual ao número
 *       de respostas 200 (sem escritas fantasmas de 422).
 *   X5. Snapshots do store antes/depois de cada bateria 422-only são idênticos.
 */
import { describe, it, expect, vi } from "vitest";
import { handlePatchTransactionContract } from "@/lib/patch-transaction-contract";

const toCents = (n: number) => Math.round(n * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

function req(body: unknown, id = "mix-tx") {
  return { method: "PATCH", id, contentType: "application/json", rawBody: JSON.stringify(body) };
}

function makeStore() {
  const rows = new Map<string, Record<string, unknown>>();
  const locks = new Map<string, Promise<void>>();
  const writes: Array<Record<string, unknown>> = [];
  const persist = vi.fn(async (id: string, patch: Record<string, unknown>) => {
    while (locks.has(id)) await locks.get(id);
    let release!: () => void;
    locks.set(id, new Promise<void>((r) => (release = r)));
    try {
      await new Promise((r) => setTimeout(r, Math.random() * 2));
      const merged = { id, ...(rows.get(id) ?? {}), ...patch };
      rows.set(id, merged);
      writes.push({ ...patch });
      return merged;
    } finally {
      locks.delete(id);
      release();
    }
  });
  return { persist, rows, writes, snapshot: () => JSON.stringify([...rows.entries()].sort()) };
}

const VALID_PAYLOADS = [
  { amount: 100, total_installments: 3 },
  { amount: 100 / 3, total_installments: 12 },
  { amount: 1.005, total_installments: 4 },
  { amount: 199.99, total_installments: 6 },
  { amount: 42, total_installments: 1 },
];

const INVALID_PAYLOADS: Array<{ label: string; body: unknown }> = [
  { label: "amount=0",           body: { amount: 0, total_installments: 3 } },
  { label: "amount negativo",    body: { amount: -1, total_installments: 3 } },
  { label: "amount string BR",   body: { amount: "1.234,56", total_installments: 3 } },
  { label: "amount string US",   body: { amount: "1,234.56", total_installments: 3 } },
  { label: "NaN",                body: { amount: Number.NaN, total_installments: 3 } },
  { label: "N=0",                body: { amount: 100, total_installments: 0 } },
  { label: "N=361 (>max)",       body: { amount: 100, total_installments: 361 } },
  { label: "N string",           body: { amount: 100, total_installments: "12" } },
  { label: "só currency",        body: { currency: "USD" } },
  { label: "só fx metadata",     body: { fx_rate: 5.12, scale: 2 } },
  { label: "só chaves inválidas", body: { role: "admin", __proto__: { p: 1 } } },
  { label: "amount null",        body: { amount: null, total_installments: 3 } },
];

function assertOkContract(res: Awaited<ReturnType<typeof handlePatchTransactionContract>>) {
  expect(res.status).toBe(200);
  if (res.status !== 200) return;
  const { installments, drift } = res.body.data;
  const N = installments.length;
  const nums = installments.map((r) => r.installment_number).sort((a, b) => a - b);
  expect(nums).toEqual(Array.from({ length: N }, (_, i) => i + 1));
  for (const it of installments) {
    expect(it.total_installments).toBe(N);
    expect(round2(it.amount)).toBe(it.amount);
  }
  const src = installments[0].installment_source_amount;
  const sum = installments.reduce((s, it) => s + toCents(it.amount), 0);
  expect(Math.abs(sum - toCents(src))).toBeLessThanOrEqual(N);
  expect(drift.ok).toBe(true);
}

function assertErrorContract(res: Awaited<ReturnType<typeof handlePatchTransactionContract>>) {
  expect(res.status).not.toBe(200);
  expect([400, 404, 405, 415, 422]).toContain(res.status);
  if (res.status !== 200) {
    expect(res.body.error).toBeTypeOf("object");
    expect(typeof res.body.error.code).toBe("string");
    expect(typeof res.body.error.message).toBe("string");
  }
}

describe("PATCH — 422 intercalados com 200 concorrentes não persistem parcial", () => {
  it("X1..X4 — mistura balanceada (12 válidos + 12 inválidos) em paralelo no mesmo id", async () => {
    const store = makeStore();
    const jobs: Array<Promise<{ kind: "ok" | "err"; res: Awaited<ReturnType<typeof handlePatchTransactionContract>> }>> = [];

    // Intercala válidos e inválidos em ordem alternada para maximizar contenção.
    for (let i = 0; i < 12; i++) {
      const v = VALID_PAYLOADS[i % VALID_PAYLOADS.length];
      const bad = INVALID_PAYLOADS[i % INVALID_PAYLOADS.length];
      jobs.push(
        handlePatchTransactionContract(req(v), { persist: store.persist, currentRow: null })
          .then((res) => ({ kind: "ok" as const, res })),
      );
      jobs.push(
        handlePatchTransactionContract(req(bad.body), { persist: store.persist, currentRow: null })
          .then((res) => ({ kind: "err" as const, res })),
      );
    }
    const results = await Promise.all(jobs);
    const oks = results.filter((r) => r.kind === "ok").map((r) => r.res);
    const errs = results.filter((r) => r.kind === "err").map((r) => r.res);

    for (const r of oks) assertOkContract(r);
    for (const r of errs) assertErrorContract(r);

    // X4 — número de writes bate com número de 200s
    expect(store.writes.length).toBe(oks.length);

    // X1 — a linha final coincide EXATAMENTE com um dos payloads válidos.
    const row = store.rows.get("mix-tx");
    expect(row).toBeTruthy();
    const match = VALID_PAYLOADS.find(
      (p) =>
        (row!.amount as number) === round2(p.amount) &&
        (row!.total_installments as number) === p.total_installments,
    );
    expect(match).toBeTruthy();

    // Nenhuma chave fora do allowlist chegou ao persist.
    const ALLOWLIST = new Set([
      "name", "amount", "total_installments", "date",
      "category", "icon", "card", "bank_account_id",
    ]);
    for (const w of store.writes) {
      for (const k of Object.keys(w)) expect(ALLOWLIST.has(k)).toBe(true);
    }
  });

  it("X5 — bateria 422-only concorrente não altera snapshot pré-existente", async () => {
    const store = makeStore();
    // Semeia com um 200.
    await handlePatchTransactionContract(req({ amount: 500, total_installments: 5 }), {
      persist: store.persist,
      currentRow: null,
    });
    const before = store.snapshot();

    const barrage = await Promise.all(
      INVALID_PAYLOADS.map(({ body }) =>
        handlePatchTransactionContract(req(body), { persist: store.persist, currentRow: null }),
      ),
    );
    for (const r of barrage) assertErrorContract(r);

    // Apenas a semeadura foi persistida.
    expect(store.writes.length).toBe(1);
    expect(store.snapshot()).toBe(before);
  });

  it("X1..X4 — burst denso: 60 requisições intercaladas com jitter", async () => {
    const store = makeStore();
    const jobs: Array<Promise<{ ok: boolean; res: Awaited<ReturnType<typeof handlePatchTransactionContract>> }>> = [];
    for (let i = 0; i < 60; i++) {
      const isValid = i % 3 !== 0; // ~40 válidos + ~20 inválidos
      const body = isValid
        ? VALID_PAYLOADS[i % VALID_PAYLOADS.length]
        : INVALID_PAYLOADS[i % INVALID_PAYLOADS.length].body;
      jobs.push(
        handlePatchTransactionContract(req(body), { persist: store.persist, currentRow: null }).then(
          (res) => ({ ok: isValid, res }),
        ),
      );
    }
    const done = await Promise.all(jobs);
    const oks = done.filter((r) => r.ok);
    const errs = done.filter((r) => !r.ok);
    for (const r of oks) assertOkContract(r.res);
    for (const r of errs) assertErrorContract(r.res);

    // X4 — writes == oks
    expect(store.writes.length).toBe(oks.length);
    // X1 — linha final é UM payload válido
    const row = store.rows.get("mix-tx")!;
    const match = VALID_PAYLOADS.find(
      (p) =>
        (row.amount as number) === round2(p.amount) &&
        (row.total_installments as number) === p.total_installments,
    );
    expect(match).toBeTruthy();
  });

  it("X2 — nenhum payload inválido chama persist (verificação direta via spy)", async () => {
    const store = makeStore();
    await Promise.all(
      INVALID_PAYLOADS.map(({ body }) =>
        handlePatchTransactionContract(req(body), { persist: store.persist, currentRow: null }),
      ),
    );
    expect(store.persist).not.toHaveBeenCalled();
    expect(store.writes).toHaveLength(0);
    expect(store.rows.size).toBe(0);
  });
});
