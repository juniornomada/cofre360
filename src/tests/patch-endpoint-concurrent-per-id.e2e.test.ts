/**
 * E2E — PATCHs concorrentes em IDs distintos, isolamento por-id.
 *
 * Sobe um servidor HTTP real que expõe o `handlePatchTransactionContract`
 * em `/tx/:id` e dispara centenas de requisições concorrentes distribuídas
 * entre múltiplos IDs. Verifica que:
 *
 *   I1. Cada resposta 200 respeita o contrato `{id, normalized, installments, drift}`.
 *   I2. `data.id === :id da rota` — nunca há vazamento cruzado.
 *   I3. Numeração 1..N contígua por resposta.
 *   I4. Drift regulamentar por resposta: |Σparcelas − source| ≤ N × 1¢.
 *   I5. Idempotência por-id: chamadas idênticas ao MESMO id retornam o
 *       mesmo payload (installments/drift/normalized).
 *   I6. Isolamento cruzado: o estado final persistido do id A não depende
 *       de payloads endereçados a B/C/D — cada id converge para um dos
 *       vencedores da sua própria fila.
 *   I7. Erros dirigidos a um id NÃO alteram estado de outros ids.
 *
 * Modela isolamento transacional via mutex por-id no store in-memory,
 * refletindo o comportamento esperado do Postgres com `UPDATE ... WHERE id`.
 */
import { describe, it, expect, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { handlePatchTransactionContract } from "@/lib/patch-transaction-contract";

const toCents = (n: number) => Math.round(n * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- Store in-memory com mutex por-id ----------
const rows = new Map<string, Record<string, unknown>>();
const locks = new Map<string, Promise<void>>();

async function persist(id: string, patch: Record<string, unknown>) {
  while (locks.has(id)) await locks.get(id);
  let release!: () => void;
  locks.set(
    id,
    new Promise<void>((r) => {
      release = r;
    }),
  );
  try {
    // jitter para embaralhar ordem de commit entre filas independentes
    await new Promise((r) => setTimeout(r, Math.random() * 2));
    const merged = { id, ...(rows.get(id) ?? {}), ...patch };
    rows.set(id, merged);
    return merged;
  } finally {
    locks.delete(id);
    release();
  }
}

// ---------- Servidor HTTP ----------
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const m = url.pathname.match(/^\/tx\/([^/]+)$/);
    if (!m) {
      res.statusCode = 404;
      res.end("not-found");
      return;
    }
    const id = decodeURIComponent(m[1]);
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const out = await handlePatchTransactionContract(
      {
        method: req.method ?? "GET",
        id,
        contentType: req.headers["content-type"] ?? null,
        rawBody: raw,
      },
      { persist, currentRow: null },
    );
    res.statusCode = out.status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(out.body));
  } catch (e) {
    res.statusCode = 500;
    res.end(String(e));
  }
});

let baseUrl = "";
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
{
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
}

afterAll(() => new Promise<void>((r) => server.close(() => r())));

async function patch(id: string, body: unknown) {
  const res = await fetch(`${baseUrl}/tx/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, body: json as { data?: any; error?: any } };
}

function assertContract(id: string, r: { status: number; body: any }) {
  expect(r.status).toBe(200);
  const d = r.body.data;
  expect(d.id).toBe(id);
  const { installments, drift, normalized } = d;
  const N = installments.length;
  const nums = installments.map((x: any) => x.installment_number).sort((a: number, b: number) => a - b);
  expect(nums).toEqual(Array.from({ length: N }, (_, i) => i + 1));
  for (const it of installments) {
    expect(it.total_installments).toBe(N);
    expect(round2(it.amount)).toBe(it.amount);
  }
  const src = installments[0].installment_source_amount;
  const sum = installments.reduce((s: number, x: any) => s + toCents(x.amount), 0);
  expect(Math.abs(sum - toCents(src))).toBeLessThanOrEqual(N);
  expect(drift.ok).toBe(true);
  expect(drift.tolerance).toBe(round2(N * 0.01));
  expect(normalized).toBeTypeOf("object");
}

describe("E2E — PATCH concorrentes em ids distintos, isolamento por-id", () => {
  it("I1..I4 — 4 ids × 25 requisições cada em paralelo: contrato preservado", async () => {
    const ids = ["e2e-a", "e2e-b", "e2e-c", "e2e-d"];
    const perId = 25;
    const jobs: Array<Promise<{ id: string; res: any }>> = [];
    for (const id of ids) {
      for (let i = 0; i < perId; i++) {
        const N = 1 + ((i * 7) % 24);
        const amount = [100 / 3, 199.99, 1.005, 250.5, 42][i % 5];
        jobs.push(patch(id, { amount, total_installments: N }).then((res) => ({ id, res })));
      }
    }
    const done = await Promise.all(jobs);
    for (const { id, res } of done) assertContract(id, res);
    // I2 — nenhum data.id fora do conjunto de ids
    for (const { id, res } of done) expect(ids).toContain(res.body.data.id);
  });

  it("I5 — idempotência por-id: 20 chamadas iguais ao mesmo id → mesmo payload", async () => {
    const id = "e2e-idempotent";
    const payload = { amount: 100 / 3, total_installments: 12 };
    const results = await Promise.all(
      Array.from({ length: 20 }, () => patch(id, payload)),
    );
    for (const r of results) assertContract(id, r);
    const canon = {
      normalized: results[0].body.data.normalized,
      installments: results[0].body.data.installments,
      drift: results[0].body.data.drift,
    };
    for (const r of results.slice(1)) {
      expect({
        normalized: r.body.data.normalized,
        installments: r.body.data.installments,
        drift: r.body.data.drift,
      }).toEqual(canon);
    }
  });

  it("I6 — isolamento cruzado: cada id converge para um vencedor da sua própria fila", async () => {
    // Cada id tem seu próprio conjunto EXCLUSIVO de payloads possíveis.
    const groups: Record<string, Array<{ amount: number; N: number }>> = {
      "iso-x": [{ amount: 100, N: 3 }, { amount: 200, N: 4 }, { amount: 300, N: 5 }],
      "iso-y": [{ amount: 11.11, N: 2 }, { amount: 22.22, N: 6 }],
      "iso-z": [{ amount: 999.99, N: 24 }, { amount: 1234.56, N: 12 }, { amount: 100 / 7, N: 7 }],
    };
    // Limpa estado prévio se houver
    for (const id of Object.keys(groups)) rows.delete(id);

    const jobs: Promise<any>[] = [];
    for (const [id, payloads] of Object.entries(groups)) {
      for (let k = 0; k < 15; k++) {
        const p = payloads[k % payloads.length];
        jobs.push(patch(id, { amount: p.amount, total_installments: p.N }));
      }
    }
    await Promise.all(jobs);

    // Para cada id, a linha final deve casar com UM payload EXCLUSIVAMENTE do seu grupo.
    for (const [id, payloads] of Object.entries(groups)) {
      const row = rows.get(id);
      expect(row).toBeTruthy();
      const match = payloads.find(
        (p) =>
          (row!.amount as number) === round2(p.amount) &&
          (row!.total_installments as number) === p.N,
      );
      expect(match).toBeTruthy();
      // E não pode casar com nenhum payload dos OUTROS grupos.
      for (const [otherId, otherPayloads] of Object.entries(groups)) {
        if (otherId === id) continue;
        const bleed = otherPayloads.find(
          (p) =>
            (row!.amount as number) === round2(p.amount) &&
            (row!.total_installments as number) === p.N &&
            !payloads.some((mine) => mine.amount === p.amount && mine.N === p.N),
        );
        expect(bleed).toBeFalsy();
      }
    }
  });

  it("I7 — 4xx dirigidos a um id NÃO alteram outros ids", async () => {
    const good = "iso-good";
    const bad = "iso-bad";
    rows.delete(good);
    rows.delete(bad);

    await patch(good, { amount: 500, total_installments: 5 });
    const snap = JSON.stringify(rows.get(good));

    // Bombardeia `bad` com payloads inválidos concorrentes.
    const badJobs = [
      patch(bad, { currency: "USD" }), // 422 empty
      patch(bad, { amount: 0, total_installments: 3 }), // 422 positive
      patch(bad, { amount: -1, total_installments: 3 }), // 422
      patch(bad, { amount: 100, total_installments: 361 }), // 422 max
      patch(bad, { amount: "1.234,56", total_installments: 3 }), // 422 type
    ];
    // Enquanto isso reforça `good` com uma chamada legítima.
    const goodJob = patch(good, { amount: 500, total_installments: 5 });
    const [gRes, ...bRes] = await Promise.all([goodJob, ...badJobs]);

    assertContract(good, gRes);
    for (const r of bRes) expect(r.status).toBe(422);

    // Estado de `good` inalterado (mesma linha lógica).
    expect(JSON.stringify(rows.get(good))).toBe(snap);
    // `bad` nunca chegou a existir no store.
    expect(rows.has(bad)).toBe(false);
  });
});
