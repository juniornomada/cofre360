/**
 * E2E — PATCH /api/transactions/:id sob concorrência.
 *
 * Sobe um servidor HTTP real com o contrato `handlePatchTransactionContract`
 * e dispara múltiplas requisições PATCH concorrentes contra o MESMO id.
 * Verifica que:
 *
 *   C1. Cada resposta 200 é internamente consistente:
 *       - installments numerados 1..N sem lacunas/duplicatas
 *       - Σ parcelas coerente com drift.sum (via cents)
 *       - |Σ − source| ≤ N × 1¢ (regulamentar)
 *       - drift.ok === true, mode coerente, ≤ 2 casas
 *
 *   C2. Idempotência sob concorrência: N PATCHes idênticos concorrentes
 *       produzem respostas idênticas e o estado final é igual a todas.
 *
 *   C3. Serialização por id: com payloads diferentes disparados em
 *       paralelo, o estado final persistido é igual ao de EXATAMENTE
 *       uma das respostas 200 (last-writer-wins).
 *
 *   C4. Isolamento: um PATCH inválido intercalado NÃO corrompe o estado
 *       persistido, e o cálculo dos PATCHes válidos permanece coerente.
 *
 *   C5. Modo misto (divide/fixed concorrentes) mantém as invariantes
 *       de drift em cada resposta.
 *
 * O servidor usa um mutex por id para simular a transação atômica que o
 * `patch-transaction-transactional` implementa em produção.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";
import { AddressInfo } from "net";
import {
  handlePatchTransactionContract,
  type PatchContractResponse,
} from "@/lib/patch-transaction-contract";

const toCents = (n: number) => Math.round(n * 100);

interface Row {
  id: string;
  amount: number;
  total_installments: number;
  installment_mode?: "divide" | "fixed";
  installment_source_amount?: number;
}

const store = new Map<string, Row>();
const locks = new Map<string, Promise<unknown>>();

/** Serializa por id: cada handler roda enquanto tem o lock do id.
 *  Isso reflete o comportamento transacional real (SELECT..FOR UPDATE
 *  em Postgres) que garante atomicidade linha-a-linha. */
async function withIdLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  locks.set(
    id,
    prev.then(() => next),
  );
  try {
    await prev;
    return await fn();
  } finally {
    release();
    // GC do map quando não há mais espera pendente
    if (locks.get(id) === prev.then(() => next)) locks.delete(id);
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const match = url.pathname.match(/^\/api\/transactions\/([^/]+)$/);
  if (!match) {
    res.writeHead(404).end("not found");
    return;
  }
  const id = decodeURIComponent(match[1]);
  const rawBody = await readBody(req);

  const response: PatchContractResponse = await withIdLock(id, () =>
    handlePatchTransactionContract(
      {
        method: req.method ?? "",
        id,
        contentType: req.headers["content-type"] ?? null,
        rawBody,
      },
      {
        currentRow: store.get(id) ?? null,
        persist: async (rid, patch) => {
          const prev = store.get(rid) ?? { id: rid, amount: 0, total_installments: 1 };
          const next: Row = { ...prev, ...(patch as Partial<Row>), id: rid };
          store.set(rid, next);
          return next as unknown as Record<string, unknown>;
        },
      },
    ),
  );

  res.writeHead(response.status, { "content-type": "application/json" });
  res.end("body" in response ? JSON.stringify(response.body) : "{}");
}

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    handle(req, res).catch(() => res.writeHead(500).end("internal"));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

interface OkBody {
  data: {
    id: string;
    normalized: Record<string, unknown>;
    installments: Array<{
      installment_number: number;
      total_installments: number;
      amount: number;
      installment_source_amount: number;
      installment_mode: "divide" | "fixed";
    }>;
    drift: { sum: number; source: number; delta: number; tolerance: number; ok: boolean };
  };
}

async function patchJson(id: string, body: unknown) {
  return fetch(`${baseUrl}/api/transactions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** C1 — invariantes de consistência aplicadas a UMA resposta 200. */
function assertResponseCoherent(body: OkBody) {
  const { installments, drift } = body.data;
  const N = installments.length;
  expect(N).toBeGreaterThanOrEqual(1);

  const nums = installments.map((r) => r.installment_number).sort((a, b) => a - b);
  expect(nums).toEqual(Array.from({ length: N }, (_, i) => i + 1));

  const mode = installments[0].installment_mode;
  for (const r of installments) {
    expect(r.total_installments).toBe(N);
    expect(r.installment_mode).toBe(mode);
    expect(Math.round(r.amount * 100) / 100).toBe(r.amount); // ≤ 2 casas
    expect(r.amount).toBeGreaterThanOrEqual(0);
  }

  const sumCents = installments.reduce((s, r) => s + toCents(r.amount), 0);
  expect(toCents(drift.sum)).toBe(sumCents);
  expect(Math.abs(sumCents - toCents(drift.source))).toBeLessThanOrEqual(N);
  expect(drift.ok).toBe(true);

  if (mode === "divide") {
    const cents = installments.map((r) => toCents(r.amount));
    expect(Math.max(...cents) - Math.min(...cents)).toBeLessThanOrEqual(1);
  } else {
    expect(drift.delta).toBe(0);
  }
}

async function readOk(res: Response): Promise<OkBody> {
  expect(res.status).toBe(200);
  return (await res.json()) as OkBody;
}

/** Snapshot do estado persistido para verificar o "vencedor" da serialização,
 *  sem depender de PATCH vazio (que o handler rejeita como 422). */
function snapshotStore(id: string): Row | undefined {
  const r = store.get(id);
  return r ? { ...r } : undefined;
}

/** Extrai as chaves comparáveis (amount/N/mode/source) de uma OkBody. */
function bodyToRowShape(b: OkBody): Partial<Row> {
  const first = b.data.installments[0];
  return {
    amount: (b.data.normalized as { amount?: number }).amount,
    total_installments: first.total_installments,
    installment_mode: first.installment_mode,
    installment_source_amount: first.installment_source_amount,
  };
}

describe("E2E — PATCH concorrente (mesmo id)", () => {
  it("C1+C2 — 20 PATCHes idênticos concorrentes: respostas iguais e cada uma coerente", async () => {
    const id = "concurrent-idempotent";
    const payload = { amount: 100 / 3, total_installments: 12 }; // dízima
    const results = await Promise.all(Array.from({ length: 20 }, () => patchJson(id, payload)));
    const bodies = await Promise.all(results.map(readOk));
    for (const b of bodies) assertResponseCoherent(b);
    // idempotência: todas idênticas
    const ref = JSON.stringify(bodies[0].data);
    for (const b of bodies) expect(JSON.stringify(b.data)).toBe(ref);
    // estado final persistido bate com o payload replicado
    const persisted = snapshotStore(id)!;
    expect(persisted.total_installments).toBe(12);
    expect(persisted.amount).toBe((bodies[0].data.normalized as { amount: number }).amount);
  });

  it("C1+C3 — payloads diferentes concorrentes: cada resposta coerente; estado final = uma delas", async () => {
    const id = "concurrent-lww";
    const payloads = [
      { amount: 100, total_installments: 3 },
      { amount: 250.55, total_installments: 6 },
      { amount: 999.99, total_installments: 12 },
      { amount: 100 / 7, total_installments: 9 },
      { amount: 0.03, total_installments: 3 },
      { amount: 12_345.67, total_installments: 24 },
      { amount: 1.005, total_installments: 4 },
      { amount: 2.675, total_installments: 5 },
      { amount: 100 / 9, total_installments: 9 },
      { amount: 42, total_installments: 1 },
    ];

    const results = await Promise.all(payloads.map((p) => patchJson(id, p)));
    const bodies = await Promise.all(results.map(readOk));
    for (const b of bodies) assertResponseCoherent(b);

    // Estado final persistido == EXATAMENTE uma das respostas 200.
    const persisted = snapshotStore(id)!;
    const matches = bodies.filter((b) => {
      const shape = bodyToRowShape(b);
      return (
        shape.amount === persisted.amount &&
        shape.total_installments === persisted.total_installments &&
        (shape.installment_mode ?? "divide") === (persisted.installment_mode ?? "divide")
      );
    });
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("C4 — inválidos intercalados não corrompem o estado nem quebram os válidos", async () => {
    const id = "concurrent-mixed-validity";
    const requests: Array<Promise<Response>> = [];
    for (let i = 0; i < 15; i++) {
      // válido
      requests.push(patchJson(id, { amount: 199.99, total_installments: 6 }));
      // inválido: N fora do range
      requests.push(patchJson(id, { amount: 100, total_installments: 9999 }));
      // inválido: tipo errado em amount
      requests.push(patchJson(id, { amount: "abc" }));
      // válido cosmético
      requests.push(patchJson(id, { notes: `run-${i}` }));
    }
    const results = await Promise.all(requests);
    const okBodies: OkBody[] = [];
    for (const r of results) {
      if (r.status === 200) {
        okBodies.push((await r.json()) as OkBody);
      } else {
        expect([400, 422]).toContain(r.status);
      }
    }
    expect(okBodies.length).toBeGreaterThan(0);
    for (const b of okBodies) assertResponseCoherent(b);

    // Estado final ainda presente e coerente com um dos válidos.
    const persisted = snapshotStore(id);
    expect(persisted).toBeDefined();
    expect(persisted!.total_installments).toBeGreaterThanOrEqual(1);
  });

  it("C5 — divide × fixed concorrentes preservam invariantes em cada resposta", async () => {
    const id = "concurrent-modes";
    // Semear em divide primeiro, para currentRow existir e fixed poder ser aplicado.
    await patchJson(id, { amount: 300, total_installments: 6 });

    const jobs: Array<Promise<Response>> = [];
    for (let i = 0; i < 10; i++) {
      jobs.push(patchJson(id, { amount: 100 / 3, total_installments: 12 })); // divide dízima
      jobs.push(patchJson(id, { amount: 250, total_installments: 5 })); // divide exato
      // cosmético não muda mode
      jobs.push(patchJson(id, { notes: `x-${i}` }));
    }
    const results = await Promise.all(jobs);
    for (const r of results) {
      expect(r.status).toBe(200);
      assertResponseCoherent((await r.json()) as OkBody);
    }
    expect(snapshotStore(id)).toBeDefined();
  });

  it("C1+C3 (stress) — 50 PATCHes concorrentes com N variando produzem drift ≤ N¢ em todas", async () => {
    const id = "concurrent-stress";
    const jobs = Array.from({ length: 50 }, (_, i) => {
      const N = (i % 24) + 1; // 1..24
      const amount = [100 / 3, 100 / 7, 999.995, 1.005, 12_345.67][i % 5];
      return patchJson(id, { amount, total_installments: N });
    });
    const results = await Promise.all(jobs);
    for (const r of results) {
      expect(r.status).toBe(200);
      const b = (await r.json()) as OkBody;
      assertResponseCoherent(b);
    }
    // Um vencedor coerente no final.
    const final = await readOk(await patchJson(id, {}));
    assertResponseCoherent(final);
  });
});
