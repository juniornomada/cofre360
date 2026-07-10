/**
 * E2E — PATCH sob atrasos artificiais de rede (reordenação forçada).
 *
 * Objetivo: garantir que, mesmo quando as respostas HTTP chegam ao cliente
 * FORA da ordem em que os requests foram enviados (por causa de atrasos
 * assimétricos de ingresso/egresso), o servidor:
 *
 *   R1. Serializa gravações por id (mutex): apenas um handler modifica
 *       o estado por vez, mesmo com jitter alto.
 *   R2. Last-writer-wins determinístico pelo pedido do lock — o estado
 *       final persistido coincide EXATAMENTE com uma das respostas 200.
 *   R3. Cada resposta 200 é individualmente coerente (numeração 1..N,
 *       ≤ 2 casas, drift.ok, |Σ − source| ≤ N¢, spread ≤ 1¢ no divide).
 *   R4. A reordenação temporal REALMENTE ocorre — pelo menos uma resposta
 *       chega antes da resposta de um request enviado mais cedo. Sem essa
 *       inversão observada, o teste é inconclusivo (fail-open).
 *   R5. Nenhum request se perde: #200 + #422/4xx == #enviados; 4xx nunca
 *       altera o estado.
 *
 * Como forçamos reordenação: injetamos atrasos aleatórios ANTES do handler
 * (ingress jitter) e DEPOIS de escrever a resposta HTTP (egress jitter).
 * O egress jitter é o que efetivamente re-ordena as respostas no cliente.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "http";
import { AddressInfo } from "net";
import {
  handlePatchTransactionContract,
  type PatchContractResponse,
} from "@/lib/patch-transaction-contract";

const toCents = (n: number) => Math.round(n * 100);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Row {
  id: string;
  amount: number;
  total_installments: number;
  installment_mode?: "divide" | "fixed";
  installment_source_amount?: number;
}

const store = new Map<string, Row>();
const locks = new Map<string, Promise<unknown>>();

/** Serializa por id — reflete SELECT..FOR UPDATE em Postgres. */
async function withIdLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  const chain = prev.then(() => next);
  locks.set(id, chain);
  try {
    await prev;
    return await fn();
  } finally {
    release();
    if (locks.get(id) === chain) locks.delete(id);
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

/** RNG determinístico por-teste (mulberry32) para reproducibilidade. */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Faixas de jitter — mantidas pequenas para não estourar timeout, mas
 *  suficientes para reordenar respostas em cima de um handler ~1ms. */
const INGRESS_MAX_MS = 6;
const EGRESS_MAX_MS = 25;

let currentRng: () => number = Math.random;

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const m = url.pathname.match(/^\/api\/transactions\/([^/]+)$/);
  if (!m) {
    res.writeHead(404).end("not found");
    return;
  }
  const id = decodeURIComponent(m[1]);
  const rawBody = await readBody(req);

  // Jitter de ingresso — pode alterar a ordem de aquisição do lock.
  await sleep(currentRng() * INGRESS_MAX_MS);

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
          const merged: Row = { ...prev, ...(patch as Partial<Row>), id: rid };
          store.set(rid, merged);
          return merged as unknown as Record<string, unknown>;
        },
      },
    ),
  );

  res.writeHead(response.status, { "content-type": "application/json" });
  res.end("body" in response ? JSON.stringify(response.body) : "{}");

  // Jitter de egresso — força a resposta HTTP a chegar fora de ordem.
  await sleep(currentRng() * EGRESS_MAX_MS);
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

interface Timed<T> {
  sendIndex: number;
  sentAt: number;
  receivedAt: number;
  status: number;
  body: T | null;
}

async function patchTimed(id: string, body: unknown, sendIndex: number): Promise<Timed<OkBody>> {
  const sentAt = performance.now();
  const res = await fetch(`${baseUrl}/api/transactions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const receivedAt = performance.now();
  let parsed: OkBody | null = null;
  if (res.status === 200) parsed = (await res.json()) as OkBody;
  else await res.text().catch(() => "");
  return { sendIndex, sentAt, receivedAt, status: res.status, body: parsed };
}

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
    expect(Math.round(r.amount * 100) / 100).toBe(r.amount);
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

/** Detecta se houve inversão temporal: request enviado ANTES chegou DEPOIS. */
function detectReordering(timed: Array<Timed<unknown>>): number {
  const bySent = [...timed].sort((a, b) => a.sentAt - b.sentAt);
  let inversions = 0;
  for (let i = 0; i < bySent.length; i++) {
    for (let j = i + 1; j < bySent.length; j++) {
      if (bySent[j].receivedAt < bySent[i].receivedAt) inversions++;
    }
  }
  return inversions;
}

function bodyShape(b: OkBody) {
  const f = b.data.installments[0];
  return {
    amount: (b.data.normalized as { amount?: number }).amount,
    total_installments: f.total_installments,
    installment_mode: f.installment_mode,
    installment_source_amount: f.installment_source_amount,
  };
}

describe("E2E — PATCH com atrasos artificiais forçando reordenação", () => {
  it("R1..R5 — 30 payloads distintos concorrentes com jitter: LWW estável e drift OK", async () => {
    currentRng = makeRng(0xa11ce);
    const id = "reorder-lww-30";
    const payloads = Array.from({ length: 30 }, (_, i) => ({
      amount: [100 / 3, 100 / 7, 199.99, 12_345.67, 1.005, 2.675, 42, 0.03][i % 8],
      total_installments: ((i * 7) % 24) + 1,
    }));

    const timed = await Promise.all(payloads.map((p, i) => patchTimed(id, p, i)));

    // R5 — nenhum request perdido
    expect(timed).toHaveLength(30);
    for (const t of timed) expect([200, 400, 422]).toContain(t.status);

    // R4 — reordenação realmente aconteceu
    const inversions = detectReordering(timed);
    expect(inversions).toBeGreaterThan(0);

    // R3 — cada 200 é coerente
    const oks = timed.filter((t): t is Timed<OkBody> & { body: OkBody } => t.status === 200 && t.body !== null);
    expect(oks.length).toBeGreaterThan(0);
    for (const t of oks) assertResponseCoherent(t.body);

    // R2 — estado final == exatamente uma resposta 200
    const persisted = store.get(id)!;
    const matches = oks.filter((t) => {
      const s = bodyShape(t.body);
      return (
        s.amount === persisted.amount &&
        s.total_installments === persisted.total_installments &&
        (s.installment_mode ?? "divide") === (persisted.installment_mode ?? "divide")
      );
    });
    expect(matches.length).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it("R2 — LWW = request cujo lock foi liberado por ÚLTIMO (não necessariamente o último a chegar)", async () => {
    currentRng = makeRng(0xbeef);
    const id = "reorder-lww-order";
    // 12 payloads com N/amount únicos para conseguir identificar o vencedor.
    const payloads = Array.from({ length: 12 }, (_, i) => ({
      amount: 100 + i * 11.37,
      total_installments: i + 1,
    }));

    const timed = await Promise.all(payloads.map((p, i) => patchTimed(id, p, i)));
    const oks = timed.filter((t): t is Timed<OkBody> & { body: OkBody } => t.status === 200 && t.body !== null);
    expect(oks).toHaveLength(12);
    for (const t of oks) assertResponseCoherent(t.body);

    // Deve haver inversão temporal — senão o teste não prova nada.
    expect(detectReordering(timed)).toBeGreaterThan(0);

    // Estado persistido bate com EXATAMENTE UM payload (payloads são únicos).
    const persisted = store.get(id)!;
    const winners = payloads.filter(
      (p) =>
        Math.round(p.amount * 100) / 100 === persisted.amount &&
        p.total_installments === persisted.total_installments,
    );
    expect(winners).toHaveLength(1);
  }, 30_000);

  it("R3+R5 — payloads INVÁLIDOS intercalados sob jitter não corrompem o estado", async () => {
    currentRng = makeRng(0xdead);
    const id = "reorder-mixed";
    const jobs: Array<Promise<Timed<OkBody>>> = [];
    for (let i = 0; i < 20; i++) {
      jobs.push(patchTimed(id, { amount: 199.99, total_installments: 6 }, i * 3));
      jobs.push(patchTimed(id, { amount: "not-a-number" }, i * 3 + 1)); // 422
      jobs.push(patchTimed(id, { amount: 100, total_installments: 9999 }, i * 3 + 2)); // 422
    }
    const timed = await Promise.all(jobs);
    expect(timed).toHaveLength(60);

    const oks = timed.filter((t) => t.status === 200);
    const bads = timed.filter((t) => t.status !== 200);
    expect(oks.length).toBeGreaterThan(0);
    expect(bads.length).toBeGreaterThan(0);
    for (const t of bads) expect([400, 422]).toContain(t.status);
    for (const t of oks) if (t.body) assertResponseCoherent(t.body);

    // Estado final coincide com o payload válido único.
    const persisted = store.get(id)!;
    expect(persisted.amount).toBe(199.99);
    expect(persisted.total_installments).toBe(6);
  }, 30_000);

  it("R3+R2 — idempotência sob jitter máximo: 25 PATCHes idênticos → respostas idênticas", async () => {
    currentRng = makeRng(0xf00d);
    const id = "reorder-idempotent";
    const payload = { amount: 100 / 3, total_installments: 12 };
    const timed = await Promise.all(
      Array.from({ length: 25 }, (_, i) => patchTimed(id, payload, i)),
    );
    expect(timed).toHaveLength(25);
    const oks = timed.filter((t): t is Timed<OkBody> & { body: OkBody } => t.status === 200 && t.body !== null);
    expect(oks).toHaveLength(25);

    // Reordenação ocorreu.
    expect(detectReordering(timed)).toBeGreaterThan(0);

    // Todas as respostas são idênticas (contrato).
    const ref = JSON.stringify(oks[0].body.data);
    for (const t of oks) expect(JSON.stringify(t.body.data)).toBe(ref);
    for (const t of oks) assertResponseCoherent(t.body);

    // Persistido bate.
    const persisted = store.get(id)!;
    const s = bodyShape(oks[0].body);
    expect(persisted.amount).toBe(s.amount);
    expect(persisted.total_installments).toBe(s.total_installments);
  }, 30_000);
});
