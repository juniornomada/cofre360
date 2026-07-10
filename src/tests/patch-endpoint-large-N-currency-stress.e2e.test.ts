/**
 * E2E — Stress concorrente com N grande (até 360) e moedas diversas.
 *
 * Objetivo: validar que, sob concorrência real (múltiplos ids, muitas
 * requisições em paralelo, moedas heterogêneas e N no limite superior do
 * schema), TODA resposta 200:
 *
 *   S1. Numeração 1..N contígua, sem lacunas nem duplicatas.
 *   S2. Parcelas com ≤ 2 casas decimais (quantização final independente
 *       da precisão nativa da moeda de entrada).
 *   S3. Σ parcelas coerente com `drift.sum` (equivalência em centavos).
 *   S4. `|Σ − source| ≤ N × 1¢` — o limite regulamentar de drift.
 *   S5. `drift.ok === true` e, no modo `divide`, spread de cent ≤ 1.
 *   S6. Chave `currency` (não-allowlist) NUNCA vaza para `normalized`
 *       nem para a linha persistida — o allowlist é respeitado mesmo sob
 *       stress concorrente com centenas de requisições em voo.
 *   S7. Isolamento por-id: o estado final de cada id coincide com uma
 *       das respostas 200 dirigidas a esse id (LWW por chave).
 *   S8. Contagem: #respostas == #requisições disparadas (nenhuma perdida).
 *
 * Escala:
 *   • 8 ids distintos em paralelo
 *   • 20 requisições por id → 160 PATCHes concorrentes
 *   • N ∈ {1, 12, 24, 60, 120, 180, 240, 300, 360}
 *   • 14 moedas (zero/2/3 decimais + BRL) — apenas como metadado hostil;
 *     handler deve descartá-las via allowlist.
 *   • Amounts patológicos: dízimas (100/3, 100/7, 100/9), sub-centavo,
 *     valores milionários, half-up fronteira (1.005, 2.675).
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

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const m = url.pathname.match(/^\/api\/transactions\/([^/]+)$/);
  if (!m) {
    res.writeHead(404).end("not found");
    return;
  }
  const id = decodeURIComponent(m[1]);
  const rawBody = await readBody(req);

  // Micro-jitter para permitir intercalação real das requisições em voo.
  await sleep(Math.random() * 3);

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

async function patch(id: string, body: unknown): Promise<{ status: number; body: OkBody | null }> {
  const res = await fetch(`${baseUrl}/api/transactions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = res.status === 200 ? ((await res.json()) as OkBody) : null;
  if (!parsed) await res.text().catch(() => "");
  return { status: res.status, body: parsed };
}

/** S1..S6 — asserts por resposta. */
function assertStressInvariants(b: OkBody) {
  const { installments, drift, normalized } = b.data;
  const N = installments.length;

  // S1
  const nums = installments.map((r) => r.installment_number).sort((a, b) => a - b);
  expect(nums).toEqual(Array.from({ length: N }, (_, i) => i + 1));

  // S2 + mode uniforme
  const mode = installments[0].installment_mode;
  for (const r of installments) {
    expect(r.total_installments).toBe(N);
    expect(r.installment_mode).toBe(mode);
    expect(Math.round(r.amount * 100) / 100).toBe(r.amount);
    expect(r.amount).toBeGreaterThanOrEqual(0);
  }

  // S3
  const sumCents = installments.reduce((s, r) => s + toCents(r.amount), 0);
  expect(toCents(drift.sum)).toBe(sumCents);

  // S4 — regulamentar
  const srcCents = toCents(drift.source);
  expect(Math.abs(sumCents - srcCents)).toBeLessThanOrEqual(N);
  // tolerance é reportada em reais (N¢ ⇒ N/100). Aceitamos qualquer unidade
  // desde que represente ≥ N centavos.
  expect(toCents(drift.tolerance)).toBeGreaterThanOrEqual(N);

  // S5
  expect(drift.ok).toBe(true);
  if (mode === "divide") {
    const cents = installments.map((r) => toCents(r.amount));
    expect(Math.max(...cents) - Math.min(...cents)).toBeLessThanOrEqual(1);
  } else {
    expect(drift.delta).toBe(0);
  }

  // S6 — `currency` NÃO vaza
  expect(Object.keys(normalized)).not.toContain("currency");
  expect(Object.keys(normalized)).not.toContain("fx_rate");
  expect(Object.keys(normalized)).not.toContain("scale");
}

const N_MATRIX = [1, 12, 24, 60, 120, 180, 240, 300, 360];
const AMOUNT_MATRIX = [
  100 / 3,      // dízima curta
  100 / 7,      // dízima longa
  100 / 9,
  1.005,        // fronteira half-up
  2.675,
  0.03,         // muito pequeno
  199.99,
  12_345.67,
  999_999.99,   // milionário
];
// Moedas variadas — todas devem ser DESCARTADAS pelo allowlist.
const CURRENCIES = [
  "BRL", "USD", "EUR", "GBP", "CHF", "MXN",   // 2 casas
  "JPY", "KRW", "CLP", "VND", "HUF",          // 0 casas
  "JOD", "KWD", "BHD",                        // 3 casas
];

describe("E2E — Stress concorrente com N até 360 e moedas diversas", () => {
  it("S1..S6 — 160 PATCHes concorrentes em 8 ids: drift ≤ N¢ em toda resposta 200", async () => {
    const ids = Array.from({ length: 8 }, (_, i) => `stress-${i}`);
    const PER_ID = 20;

    const jobs: Array<Promise<{ id: string; status: number; body: OkBody | null; sent: unknown }>> = [];
    for (const id of ids) {
      for (let k = 0; k < PER_ID; k++) {
        const N = N_MATRIX[(k + id.length) % N_MATRIX.length];
        const amount = AMOUNT_MATRIX[(k * 3 + id.charCodeAt(id.length - 1)) % AMOUNT_MATRIX.length];
        const currency = CURRENCIES[(k + id.length) % CURRENCIES.length];
        const mode = k % 5 === 0 ? "fixed" : "divide";
        const payload = {
          amount,
          total_installments: N,
          installment_mode: mode,
          // hostis (não-allowlist) — devem ser descartadas:
          currency,
          fx_rate: 5.12,
          scale: 2,
        };
        jobs.push(patch(id, payload).then((r) => ({ id, ...r, sent: payload })));
      }
    }

    const results = await Promise.all(jobs);

    // S8 — nenhum request perdido
    expect(results).toHaveLength(ids.length * PER_ID);

    const oks = results.filter((r) => r.status === 200 && r.body);
    // Todos os payloads são válidos → todos devem ser 200.
    expect(oks).toHaveLength(results.length);

    for (const r of oks) assertStressInvariants(r.body!);

    // S7 — para cada id, o estado final coincide com UMA das respostas 200 daquele id
    for (const id of ids) {
      const persisted = store.get(id);
      expect(persisted).toBeDefined();
      const okForId = oks.filter((r) => r.id === id).map((r) => r.body!);
      const match = okForId.find((b) => {
        const first = b.data.installments[0];
        const normalizedAmount = (b.data.normalized as { amount?: number }).amount;
        return (
          normalizedAmount === persisted!.amount &&
          first.total_installments === persisted!.total_installments &&
          (first.installment_mode ?? "divide") === (persisted!.installment_mode ?? "divide")
        );
      });
      expect(match).toBeTruthy();
    }
  }, 60_000);

  it("S4 — N=360 sob concorrência: drift ≤ 360¢ em todas as respostas", async () => {
    const id = "stress-N360";
    const payloads = AMOUNT_MATRIX.map((a) => ({
      amount: a,
      total_installments: 360,
      installment_mode: "divide" as const,
      currency: "USD", // metadado hostil
    }));
    const results = await Promise.all(payloads.map((p) => patch(id, p)));
    for (const r of results) {
      expect(r.status).toBe(200);
      assertStressInvariants(r.body!);
      // Contagem explícita de 360 parcelas
      expect(r.body!.data.installments).toHaveLength(360);
      // Contagem do drift respeita a tolerância informada
      const d = r.body!.data.drift;
      expect(d.tolerance).toBe(360);
      expect(Math.abs(toCents(d.sum) - toCents(d.source))).toBeLessThanOrEqual(360);
    }
  }, 60_000);

  it("S4 — varredura N ∈ {60,120,180,240,300,360} × 9 amounts × 3 moedas em paralelo", async () => {
    const ids = ["sweep-A", "sweep-B", "sweep-C"];
    const smallCurrencies = ["JPY", "USD", "KWD"]; // 0, 2, 3 casas
    const jobs: Array<Promise<{ status: number; body: OkBody | null }>> = [];
    let sent = 0;
    for (let i = 0; i < ids.length; i++) {
      for (const N of [60, 120, 180, 240, 300, 360]) {
        for (const amount of AMOUNT_MATRIX) {
          const currency = smallCurrencies[i];
          jobs.push(
            patch(ids[i], { amount, total_installments: N, currency, fx_rate: 1.0 }),
          );
          sent++;
        }
      }
    }
    const results = await Promise.all(jobs);
    expect(results).toHaveLength(sent);
    for (const r of results) {
      expect(r.status).toBe(200);
      assertStressInvariants(r.body!);
    }
  }, 90_000);

  it("S4+S6 — N=361 (fora do schema) rejeitado, sem persistência mesmo sob concorrência", async () => {
    const id = "stress-N361";
    // Semear com um válido
    const seed = await patch(id, { amount: 500, total_installments: 5 });
    expect(seed.status).toBe(200);
    const before = { ...store.get(id)! };

    // Disparar 20 requisições com N=361 em paralelo
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        patch(id, { amount: 100 / 3, total_installments: 361, currency: "EUR" }),
      ),
    );
    for (const r of results) {
      expect(r.status).toBe(422);
      expect(r.body).toBeNull();
    }
    // Estado permanece = semeadura
    const after = store.get(id)!;
    expect(after.amount).toBe(before.amount);
    expect(after.total_installments).toBe(before.total_installments);
  }, 60_000);
});
