/**
 * Contrato PATCH — resposta enriquecida com campos futuros de TIPOS
 * INCOMPATÍVEIS deve continuar sendo aceita pelos parsers V1 e V2 lenientes,
 * sem alterar o cálculo/drift dos campos obrigatórios; e payloads de request
 * com um campo obrigatório de TIPO inválido devem retornar 422 sem persistir.
 *
 * Motivação:
 *   Parsers lenientes (`.passthrough()`) preservam chaves desconhecidas mas
 *   NÃO tipam essas chaves — logo, um metadado futuro que apareça em versões
 *   posteriores como um objeto pode ser emitido temporariamente como string,
 *   número ou array em respostas intermediárias, e o cliente antigo deve
 *   sobreviver a isso (forward-compat). O contrato é: campos DESCONHECIDOS
 *   podem ter qualquer tipo; campos CONHECIDOS têm tipo fixo e nunca podem
 *   ser perturbados pelo enriquecimento.
 *
 * Cobertura:
 *   F1. Injeção de futuros com tipos incompatíveis em root/data/drift/parcela.
 *   F2. V1 e V2 lenientes aceitam a resposta enriquecida.
 *   F3. Campos obrigatórios mantêm seus tipos originais (inclusive `drift`).
 *   F4. Regras R1..R6 permanecem verdadeiras (drift ≤ N¢, contiguidade etc.).
 *   F5. Request com tipo obrigatório inválido → 422 VALIDATION_ERROR e
 *       persist NÃO é chamado, sem side-effects.
 */
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import {
  handlePatchTransactionVersioned,
  type VersionedRequest,
  type VersionedResponse,
} from "@/lib/patch-transaction-versioned";

// ---------------- Helpers ----------------

const toCents = (n: number) => Math.round(n * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

function makeCtx() {
  const persist = vi.fn(async (id: string, patch: Record<string, unknown>) => ({
    id,
    ...patch,
  }));
  return { persist, currentRow: null as null };
}

function req(
  body: unknown,
  opts: {
    id?: string;
    headers?: Record<string, string | undefined>;
  } = {},
): VersionedRequest {
  return {
    method: "PATCH",
    id: opts.id ?? "tx-future-junk",
    contentType: "application/json",
    rawBody: JSON.stringify(body),
    headers: opts.headers,
  };
}

// ---------------- Schemas lenientes (V1/V2) ----------------

const InstallmentLenientZ = z
  .object({
    installment_number: z.number().int().positive(),
    total_installments: z.number().int().positive(),
    amount: z.number().finite().nonnegative(),
    installment_source_amount: z.number().finite().nonnegative(),
    installment_mode: z.enum(["divide", "fixed"]),
  })
  .passthrough();

const DriftLenientZ = z
  .object({
    sum: z.number(),
    source: z.number(),
    delta: z.number().nonnegative(),
    tolerance: z.number().nonnegative(),
    ok: z.boolean(),
  })
  .passthrough();

// V1 exposto pelo servidor: { schema_version, data: { id, installments } }.
const V1LenientZ = z
  .object({
    schema_version: z.literal("1"),
    data: z
      .object({
        id: z.string(),
        installments: z.array(InstallmentLenientZ).min(1),
      })
      .passthrough(),
  })
  .passthrough();

// V2 exposto pelo servidor: V1 + normalized + drift.
const V2LenientZ = z
  .object({
    schema_version: z.literal("2"),
    data: z
      .object({
        id: z.string(),
        normalized: z.object({}).passthrough(),
        installments: z.array(InstallmentLenientZ).min(1),
        drift: DriftLenientZ,
      })
      .passthrough(),
  })
  .passthrough();

/** Injeta metadados futuros com TIPOS INCOMPATÍVEIS em todos os níveis.
 *  Cada chave abaixo, num contrato futuro coerente, seria um OBJETO — aqui
 *  é emitida como string, número, array ou boolean para simular respostas
 *  transitórias mal-formadas de proxies/serviços intermediários. */
function injectHostileFutures<T>(body: T): T {
  const clone: unknown = JSON.parse(JSON.stringify(body));
  const anyBody = clone as Record<string, unknown> & {
    data?: Record<string, unknown>;
  };
  // Root: `trace` deveria ser objeto → vem como string; `flags` deveria ser
  // objeto de configuração → vem como array.
  anyBody.trace = "req_TRACE_STRING_NOT_OBJECT";
  anyBody.flags = ["exp.v3", "exp.rounding"];
  anyBody.retry_count = 3;

  const data = anyBody.data ?? {};
  // data.audit: objeto → array; data.provenance: objeto → string.
  data.audit = [1, 2, 3];
  data.provenance = "svc:edge@worker";
  data.experiments = true;

  // Cada parcela recebe metadados futuros com tipos absurdos.
  const rows = (data.installments as unknown[]) ?? [];
  data.installments = rows.map((r, i) => ({
    ...(r as Record<string, unknown>),
    // ledger deveria ser {book,line} → vem como string.
    ledger: `book:${i}`,
    // tags deveria ser array<string> → vem como número.
    tags: 42 + i,
    // rounding_policy deveria ser string enum → vem como objeto.
    rounding_policy: { name: "half-away", version: 3 },
    // colisão intencional: metadados carregando chaves iguais às do contrato,
    // mas sob um sub-objeto — não devem influenciar o campo real.
    extras: { installment_number: -999, amount: -1 },
  }));

  // Drift ganha meta com tipos ruins. `model` deveria ser objeto → string.
  if (data.drift && typeof data.drift === "object") {
    Object.assign(data.drift as Record<string, unknown>, {
      model: "drift-v3-string",
      confidence: "high", // deveria ser number
      breakdown: 0.99, // deveria ser array
    });
  }
  return clone as T;
}

/** Verifica invariantes regulatórias R1..R6 sobre parcelas + drift. */
function assertR1toR6(
  installments: ReadonlyArray<z.infer<typeof InstallmentLenientZ>>,
  drift?: z.infer<typeof DriftLenientZ>,
) {
  const N = installments.length;
  // R1 — total_installments homogêneo.
  for (const r of installments) expect(r.total_installments).toBe(N);
  // R2 — numeração contígua 1..N.
  const nums = installments.map((r) => r.installment_number).sort((a, b) => a - b);
  expect(nums).toEqual(Array.from({ length: N }, (_, i) => i + 1));
  // R3 — amount é decimal de 2 casas.
  for (const r of installments) expect(round2(r.amount)).toBe(r.amount);
  // R4 — installment_mode homogêneo.
  const mode = installments[0].installment_mode;
  for (const r of installments) expect(r.installment_mode).toBe(mode);
  // R5 — drift econômico ≤ N¢.
  const src = installments[0].installment_source_amount;
  const sumC = installments.reduce((s, r) => s + toCents(r.amount), 0);
  expect(Math.abs(sumC - toCents(src))).toBeLessThanOrEqual(N);
  // R6 — drift metric (quando presente) coerente e ok=true.
  if (drift) {
    expect(toCents(drift.sum)).toBe(sumC);
    expect(drift.tolerance).toBe(round2(N * 0.01));
    expect(drift.ok).toBe(true);
  }
}

// Payload de PATCH válido — 3 parcelas × R$100 (dízima → 33.34/33.33/33.33).
const VALID = { amount: 100, total_installments: 3 };

// ---------------- Testes ----------------

describe("PATCH — enriquecimento futuro com tipos incompatíveis", () => {
  it("V2 leniente aceita resposta enriquecida com tipos hostis e R1..R6 continuam válidas", async () => {
    const ctx = makeCtx();
    const res = await handlePatchTransactionVersioned(
      req(VALID, { headers: { "Accept-Version": "2" } }),
      ctx,
    );
    if (res.status !== 200) throw new Error(`esperado 200 V2, recebeu ${res.status}`);
    expect(res.version).toBe("2");

    const enriched = injectHostileFutures(res.body);
    const parsed = V2LenientZ.parse(enriched);

    // Campos obrigatórios preservam TIPOS canônicos apesar do lixo circundante.
    expect(typeof parsed.data.id).toBe("string");
    for (const r of parsed.data.installments) {
      expect(typeof r.amount).toBe("number");
      expect(typeof r.installment_number).toBe("number");
      expect(typeof r.installment_source_amount).toBe("number");
      expect(typeof r.installment_mode).toBe("string");
    }
    expect(typeof parsed.data.drift.sum).toBe("number");
    expect(typeof parsed.data.drift.ok).toBe("boolean");

    // Metadados hostis passaram (passthrough) sem influenciar o contrato.
    const dataAny = parsed.data as unknown as Record<string, unknown>;
    expect(typeof dataAny.provenance).toBe("string");
    expect(Array.isArray(dataAny.audit)).toBe(true);
    // Colisão em sub-objeto NÃO contamina o campo top-level.
    for (const r of parsed.data.installments) {
      expect(r.installment_number).toBeGreaterThan(0);
      expect(r.amount).toBeGreaterThanOrEqual(0);
    }

    assertR1toR6(parsed.data.installments, parsed.data.drift);
  });

  it("V1 leniente aceita a mesma resposta enriquecida (drift ausente é opcional em V1)", async () => {
    const ctx = makeCtx();
    const res = await handlePatchTransactionVersioned(
      req(VALID, { headers: { "Accept-Version": "1" } }),
      ctx,
    );
    if (res.status !== 200) throw new Error(`esperado 200 V1, recebeu ${res.status}`);
    expect(res.version).toBe("1");

    const enriched = injectHostileFutures(res.body);
    const parsed = V1LenientZ.parse(enriched);

    expect(parsed.schema_version).toBe("1");
    // V1 não carrega drift no envelope — as parcelas ainda são a fonte de verdade.
    assertR1toR6(parsed.data.installments);

    // Metadados hostis passam via passthrough sem afetar tipos obrigatórios.
    const dataAny = parsed.data as unknown as Record<string, unknown>;
    expect(dataAny.experiments).toBe(true);
    expect(Array.isArray(dataAny.audit)).toBe(true);
  });

  it("tipos hostis dentro de installments não vazam para as chaves canônicas", async () => {
    const ctx = makeCtx();
    const res = await handlePatchTransactionVersioned(
      req(VALID, { headers: { "Accept-Version": "2" } }),
      ctx,
    );
    if (res.status !== 200) throw new Error("bootstrap V2 falhou");

    const enriched = injectHostileFutures(res.body);
    const parsed = V2LenientZ.parse(enriched);

    for (const r of parsed.data.installments as unknown as Array<Record<string, unknown>>) {
      // Chaves hostis presentes com os TIPOS INCOMPATÍVEIS injetados.
      expect(typeof r.ledger).toBe("string");
      expect(typeof r.tags).toBe("number");
      expect(typeof r.rounding_policy).toBe("object");
      // Chaves canônicas mantêm seus tipos originais.
      expect(typeof r.installment_number).toBe("number");
      expect(typeof r.amount).toBe("number");
    }
    // O ctx do handler foi realmente exercitado (bootstrap 200 real).
    expect(ctx.persist).toHaveBeenCalledTimes(1);
  });

  it("V2 estrito (assinatura oposta) REJEITA a resposta enriquecida — prova que a tolerância é intencional em V1/V2 lenientes", async () => {
    const ctx = makeCtx();
    const res = await handlePatchTransactionVersioned(
      req(VALID, { headers: { "Accept-Version": "2" } }),
      ctx,
    );
    if (res.status !== 200) throw new Error("bootstrap V2 falhou");
    const enriched = injectHostileFutures(res.body);

    const V2Strict = z
      .object({
        schema_version: z.literal("2"),
        data: z
          .object({
            id: z.string(),
            normalized: z.object({}).passthrough(),
            installments: z.array(
              z
                .object({
                  installment_number: z.number(),
                  total_installments: z.number(),
                  amount: z.number(),
                  installment_source_amount: z.number(),
                  installment_mode: z.enum(["divide", "fixed"]),
                })
                .strict(),
            ),
            drift: z
              .object({
                sum: z.number(),
                source: z.number(),
                delta: z.number(),
                tolerance: z.number(),
                ok: z.boolean(),
              })
              .strict(),
          })
          .strict(),
      })
      .strict();
    expect(() => V2Strict.parse(enriched)).toThrow();
  });

  // ---------------- 422 quando o TIPO obrigatório do REQUEST é inválido ----

  const invalidRequests: Array<{ label: string; body: Record<string, unknown> }> = [
    { label: "amount como string", body: { amount: "300", total_installments: 3 } },
    { label: "amount como array", body: { amount: [300], total_installments: 3 } },
    { label: "amount como objeto", body: { amount: { value: 300 }, total_installments: 3 } },
    { label: "amount como boolean", body: { amount: true, total_installments: 3 } },
    { label: "amount como null", body: { amount: null, total_installments: 3 } },
    { label: "amount NaN", body: { amount: Number.NaN, total_installments: 3 } },
    { label: "amount Infinity", body: { amount: Number.POSITIVE_INFINITY, total_installments: 3 } },
    { label: "amount negativo", body: { amount: -1, total_installments: 3 } },
    { label: "total_installments como string", body: { amount: 300, total_installments: "3" } },
    { label: "total_installments como float", body: { amount: 300, total_installments: 2.5 } },
    { label: "total_installments como array", body: { amount: 300, total_installments: [3] } },
    { label: "total_installments = 0", body: { amount: 300, total_installments: 0 } },
    { label: "total_installments > 360", body: { amount: 300, total_installments: 361 } },
    { label: "name como número", body: { name: 42, amount: 300, total_installments: 3 } },
    { label: "date como array", body: { date: ["2026-01-01"], amount: 300, total_installments: 3 } },
    { label: "category como número", body: { category: 7, amount: 300, total_installments: 3 } },
  ];

  it.each(invalidRequests)(
    "$label → 422 VALIDATION_ERROR, persist NÃO chamado, sem side-effects",
    async ({ body }) => {
      const ctx = makeCtx();
      const res = await handlePatchTransactionVersioned(
        req(body, { headers: { "Accept-Version": "2" } }),
        ctx,
      );
      if (res.status !== 422) {
        throw new Error(`esperado 422, recebeu ${res.status}: ${JSON.stringify(res)}`);
      }
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(Array.isArray(res.body.error.details)).toBe(true);
      expect(res.body.error.details!.length).toBeGreaterThan(0);
      for (const d of res.body.error.details!) {
        expect(typeof d.path).toBe("string");
        expect(typeof d.message).toBe("string");
      }
      // Invariante crítico — nenhum caminho de validação suja o storage.
      expect(ctx.persist).not.toHaveBeenCalled();
    },
  );

  it("422 não vaza data/installments/drift — envelope de erro é puro", async () => {
    const ctx = makeCtx();
    const res: VersionedResponse = await handlePatchTransactionVersioned(
      req({ amount: "nope", total_installments: 3 }, { headers: { "Accept-Version": "2" } }),
      ctx,
    );
    if (res.status !== 422) throw new Error("esperado 422");
    expect(Object.keys(res.body)).toEqual(["error"]);
    const bodyAny = res.body as unknown as Record<string, unknown>;
    expect(bodyAny.data).toBeUndefined();
    expect(bodyAny.drift).toBeUndefined();
    expect(bodyAny.installments).toBeUndefined();
    expect(ctx.persist).not.toHaveBeenCalled();
  });
});
