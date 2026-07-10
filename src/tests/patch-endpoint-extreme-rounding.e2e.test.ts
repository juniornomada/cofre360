/**
 * E2E — endpoint PATCH /api/transactions/:id (arredondamento extremo).
 *
 * Sobe um servidor HTTP real (Node `http`) que expõe o contrato do handler
 * `handlePatchTransactionContract` e valida, via `fetch`:
 *   • Response 200 com body JSON no shape { data: { id, normalized, installments, drift } }
 *   • Cabeçalho Content-Type application/json
 *   • Σ parcelas coerente com drift.sum
 *   • |Σ − source| ≤ N × 1¢ (distribuição do centavo dentro da tolerância)
 *   • Cada parcela com ≤ 2 casas decimais e numeração 1..N sem repetições/lacunas
 *   • Modo fixed: drift exatamente 0
 *   • Códigos 4xx corretos para method/content-type/body inválidos
 *
 * Cobre entradas patológicas: sub-cent, half-up, dízimas (100/3, 100/7, 100/9),
 * valores altos, float phantom (0.1+0.2), N ∈ {1, 12, 24, 36}.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";
import { AddressInfo } from "net";
import {
  handlePatchTransactionContract,
  type PatchContractResponse,
} from "@/lib/patch-transaction-contract";

const CENT = 0.01;
const round2 = (n: number) => Math.round(n * 100) / 100;

function decimalPlaces(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const s = String(n);
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

// -------------- servidor HTTP mínimo com o contrato --------------
// Estado in-memory por teste
interface Row {
  id: string;
  amount: number;
  total_installments: number;
  installment_mode?: "divide" | "fixed";
  installment_source_amount?: number;
}
const store = new Map<string, Row>();

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
  const response: PatchContractResponse = await handlePatchTransactionContract(
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
  );

  res.writeHead(response.status, { "content-type": "application/json" });
  if ("body" in response) {
    res.end(JSON.stringify(response.body));
  } else {
    res.end("{}");
  }
}

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    handle(req, res).catch(() => {
      res.writeHead(500).end("internal");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

// -------------- helpers de request --------------
async function patchJson(id: string, body: unknown, init: RequestInit = {}) {
  return fetch(`${baseUrl}/api/transactions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    body: init.body ?? JSON.stringify(body),
    ...init,
  });
}

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

/** invariantes E2E — soma coerente e distribuição do centavo consistente. */
function assertConsistent(body: OkBody, expectedN: number, mode: "divide" | "fixed") {
  const { installments, drift } = body.data;

  // shape mínimo
  expect(installments).toHaveLength(expectedN);
  const nums = installments.map((r) => r.installment_number).sort((a, b) => a - b);
  expect(nums).toEqual(Array.from({ length: expectedN }, (_, i) => i + 1));

  for (const r of installments) {
    expect(r.total_installments).toBe(expectedN);
    expect(r.installment_mode).toBe(mode);
    expect(decimalPlaces(r.amount)).toBeLessThanOrEqual(2);
    expect(round2(r.amount)).toBe(r.amount);
    expect(r.amount).toBeGreaterThanOrEqual(0);
  }

  // Σ parcelas coerente com drift.sum (E2E vindo do JSON)
  const sum = round2(installments.reduce((s, r) => s + r.amount, 0));
  expect(drift.sum).toBe(sum);

  // Distribuição do centavo: diff em centavos ≤ N
  const diffCents = Math.round(Math.abs(sum - drift.source) * 100);
  expect(diffCents).toBeLessThanOrEqual(expectedN);
  expect(drift.tolerance).toBe(round2(expectedN * CENT));
  expect(drift.delta).toBeLessThanOrEqual(drift.tolerance + 1e-9);
  expect(drift.ok).toBe(true);

  // Consistência da distribuição: no modo divide, parcelas diferem no MÁXIMO 1¢
  if (mode === "divide" && installments.length > 1) {
    const values = installments.map((r) => r.amount);
    const maxV = Math.max(...values);
    const minV = Math.min(...values);
    const spreadCents = Math.round((maxV - minV) * 100);
    expect(spreadCents).toBeLessThanOrEqual(1);
    // e o número de "parcelas altas" (com +1¢) == diff em centavos
    const highs = values.filter((v) => Math.round((v - minV) * 100) === 1).length;
    if (spreadCents === 1) expect(highs).toBe(diffCents);
  }
}

// -------------- suíte E2E --------------
describe("E2E PATCH /api/transactions/:id — arredondamento extremo", () => {
  const cases: Array<{ label: string; amount: number; N: number }> = [
    { label: "sub-cent 0.001 / N=1", amount: 0.001, N: 1 },
    { label: "sub-cent 0.009 / N=12", amount: 0.009, N: 12 },
    { label: "half-up 1.005 / N=1", amount: 1.005, N: 1 },
    { label: "half-up 2.675 / N=1", amount: 2.675, N: 1 },
    { label: "half-up 0.015 / N=3", amount: 0.015, N: 3 },
    { label: "dízima 100 / N=3", amount: 100, N: 3 },
    { label: "dízima 100 / N=6", amount: 100, N: 6 },
    { label: "dízima 100 / N=7", amount: 100, N: 7 },
    { label: "dízima 100 / N=9", amount: 100, N: 9 },
    { label: "alto 9999999.99 / N=12", amount: 9_999_999.99, N: 12 },
    { label: "alto 500000.55 / N=24", amount: 500_000.55, N: 24 },
    { label: "N máximo 100/36", amount: 100, N: 36 },
    { label: "N=1 trivial", amount: 33.33, N: 1 },
  ];

  it.each(cases)("$label → 200 com soma coerente e distribuição do centavo", async ({ amount, N }) => {
    const id = `tx-${amount}-${N}`;
    const res = await patchJson(id, { amount, total_installments: N });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as OkBody;
    expect(body.data.id).toBe(id);
    assertConsistent(body, N, "divide");
  });

  it("float phantom 0.1+0.2 é saneado para 0.3 e o drift permanece OK", async () => {
    const res = await patchJson("tx-phantom", { amount: 0.1 + 0.2, total_installments: 3 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as OkBody;
    expect(body.data.normalized.amount).toBe(0.3);
    assertConsistent(body, 3, "divide");
    expect(body.data.drift.source).toBe(round2(0.3 * 3));
  });

  it("modo fixed preserva drift == 0 (soma == parcela × N)", async () => {
    const id = "tx-fixed";
    // seed direto no store (representa uma linha já persistida em modo fixed)
    store.set(id, { id, amount: 33.33, total_installments: 3, installment_mode: "fixed" });
    const res = await patchJson(id, { amount: 33.33 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as OkBody;
    assertConsistent(body, 3, "fixed");
    expect(body.data.drift.delta).toBe(0);
    expect(body.data.drift.sum).toBe(round2(33.33 * 3));
  });

  it("dois PATCHes idênticos são idempotentes (mesmas parcelas, mesmo drift)", async () => {
    const id = "tx-idem";
    const first = await patchJson(id, { amount: 100, total_installments: 7 });
    const second = await patchJson(id, { amount: 100, total_installments: 7 });
    const a = (await first.json()) as OkBody;
    const b = (await second.json()) as OkBody;
    expect(b.data.installments).toEqual(a.data.installments);
    expect(b.data.drift).toEqual(a.data.drift);
  });

  it("patch parcial só de total_installments recomputa a partir da linha persistida", async () => {
    const id = "tx-partial";
    // cria base com amount=33.33 / N=3
    await patchJson(id, { amount: 33.33, total_installments: 3 });
    // agora altera apenas N
    const res = await patchJson(id, { total_installments: 7 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as OkBody;
    assertConsistent(body, 7, "divide");
    // source herdado da linha atual (installment_source_amount = 33.33 * 3)
    expect(body.data.drift.source).toBe(round2(33.33 * 3));
  });

  // -------- erros HTTP --------
  it("método não permitido → 405", async () => {
    const res = await fetch(`${baseUrl}/api/transactions/x`, { method: "GET" });
    expect(res.status).toBe(405);
  });

  it("content-type inválido → 415", async () => {
    const res = await fetch(`${baseUrl}/api/transactions/x`, {
      method: "PATCH",
      headers: { "content-type": "text/plain" },
      body: "hello",
    });
    expect(res.status).toBe(415);
  });

  it("JSON malformado → 400", async () => {
    const res = await patchJson("x", null, { body: "{ not json" });
    expect(res.status).toBe(400);
  });

  it("payload só com chaves fora do allowlist → 422 e nenhuma parcela é retornada", async () => {
    const res = await patchJson("x", { __proto__: {}, foo: "bar", secret: 1 });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).not.toHaveProperty("data");
  });

  it("total_installments inválido (0) → 422 sem tocar parcelas", async () => {
    const res = await patchJson("x", { total_installments: 0 });
    expect(res.status).toBe(422);
  });
});
