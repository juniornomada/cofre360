/**
 * Contrato PATCH — fallback seguro para versões de schema inexistentes.
 *
 * Cenário: cliente pede uma versão de schema que o servidor não implementa.
 * Duas ramificações contratuais:
 *
 *  (A) Sem opt-in de fallback  → 406 Not Acceptable, `persist` NUNCA é chamado,
 *      erro estruturado com a lista de versões suportadas.
 *  (B) Com opt-in de fallback  → 200 servindo DEFAULT_VERSION + envelope
 *      `warning: { code: "VERSION_FALLBACK", requested, served, supported }`.
 *      As regras de drift R1..R6 permanecem íntegras — o versionamento
 *      afeta o envelope, nunca o cálculo econômico.
 *
 * O opt-in é feito por `Accept-Version-Fallback: default` (header) ou
 * `?fallback=default` (query). Qualquer outro valor equivale a NÃO opt-in.
 *
 * Este arquivo cobre:
 *   1. Recusa (406) para um catálogo amplo de versões desconhecidas.
 *   2. Precedência: versão desconhecida em Accept-Version prevalece sobre
 *      um X-Schema-Version válido — não há downgrade silencioso.
 *   3. Fallback opt-in via header/query, com invariantes R1..R6 preservadas.
 *   4. Fallback não é ativado por valores próximos ("Default", "true", "1"),
 *      apenas o token exato `default` (case-insensitive).
 *   5. Fallback sobre payload de validação (422) preserva o formato de erro
 *      canônico — não vaza `warning` em respostas de erro.
 */
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import {
  handlePatchTransactionVersioned,
  wantsSafeFallback,
  SUPPORTED_VERSIONS,
  DEFAULT_VERSION,
  type VersionedRequest,
  type VersionedResponse,
} from "@/lib/patch-transaction-versioned";
import type { InstallmentPreview } from "@/lib/patch-transaction-contract";

const toCents = (n: number) => Math.round(n * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------- Helpers ----------------

function makeCtx() {
  const persist = vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch }));
  return { persist, currentRow: null as null };
}

function req(
  body: unknown,
  opts: {
    id?: string;
    headers?: Record<string, string | undefined>;
    query?: Record<string, string | undefined>;
  } = {},
): VersionedRequest {
  return {
    method: "PATCH",
    id: opts.id ?? "tx-fallback",
    contentType: "application/json",
    rawBody: JSON.stringify(body),
    headers: opts.headers,
    query: opts.query,
  };
}

type LooseInstallment = Partial<InstallmentPreview>;

function narrow(rows: ReadonlyArray<LooseInstallment>): InstallmentPreview[] {
  return rows.map((r, i) => {
    for (const k of [
      "installment_number",
      "total_installments",
      "amount",
      "installment_source_amount",
      "installment_mode",
    ] as const) {
      if (r[k] === undefined) throw new Error(`installments[${i}].${k} ausente`);
    }
    return {
      installment_number: r.installment_number as number,
      total_installments: r.total_installments as number,
      amount: r.amount as number,
      installment_source_amount: r.installment_source_amount as number,
      installment_mode: r.installment_mode as "divide" | "fixed",
    };
  });
}

function assertDriftInvariants(rawInstallments: ReadonlyArray<LooseInstallment>) {
  const installments = narrow(rawInstallments);
  const N = installments.length;
  expect(N).toBeGreaterThanOrEqual(1);
  for (const r of installments) expect(r.total_installments).toBe(N);
  const nums = installments.map((r) => r.installment_number).sort((a, b) => a - b);
  expect(nums).toEqual(Array.from({ length: N }, (_, i) => i + 1));
  const mode = installments[0].installment_mode;
  for (const r of installments) {
    expect(r.installment_mode).toBe(mode);
    expect(Math.round(r.amount * 100) / 100).toBe(r.amount);
  }
  const source = installments[0].installment_source_amount;
  const sumCents = installments.reduce((s, r) => s + toCents(r.amount), 0);
  expect(Math.abs(sumCents - toCents(source))).toBeLessThanOrEqual(N);
}

type LooseDrift = Partial<{
  sum: number;
  source: number;
  delta: number;
  tolerance: number;
  ok: boolean;
}>;

function assertDriftMetric(
  rawInstallments: ReadonlyArray<LooseInstallment>,
  rawDrift: LooseDrift,
) {
  for (const k of ["sum", "source", "delta", "tolerance", "ok"] as const) {
    if (rawDrift[k] === undefined) throw new Error(`drift.${k} ausente`);
  }
  const drift = {
    sum: rawDrift.sum as number,
    source: rawDrift.source as number,
    delta: rawDrift.delta as number,
    tolerance: rawDrift.tolerance as number,
    ok: rawDrift.ok as boolean,
  };
  const installments = narrow(rawInstallments);
  const N = installments.length;
  const sumCents = installments.reduce((s, r) => s + toCents(r.amount), 0);
  expect(drift.tolerance).toBe(round2(N * 0.01));
  expect(drift.ok).toBe(true);
  expect(toCents(drift.sum)).toBe(sumCents);
  expect(drift.delta).toBeLessThanOrEqual(drift.tolerance + 1e-9);
}

// Schemas Zod: envelope de fallback (200 servindo DEFAULT_VERSION = "2").
const installmentSchema = z.object({
  installment_number: z.number().int().min(1),
  total_installments: z.number().int().min(1),
  amount: z.number().nonnegative(),
  installment_source_amount: z.number().nonnegative(),
  installment_mode: z.enum(["divide", "fixed"]),
});
const driftSchema = z.object({
  sum: z.number(),
  source: z.number(),
  delta: z.number().nonnegative(),
  tolerance: z.number().nonnegative(),
  ok: z.boolean(),
});
const warningSchema = z.object({
  code: z.literal("VERSION_FALLBACK"),
  requested: z.string(),
  served: z.enum(SUPPORTED_VERSIONS),
  supported: z.array(z.enum(SUPPORTED_VERSIONS)).min(1),
});
const fallbackBodyV2 = z.object({
  schema_version: z.literal("2"),
  data: z.object({
    id: z.string().min(1),
    normalized: z.record(z.string(), z.unknown()),
    installments: z.array(installmentSchema).min(1),
    drift: driftSchema,
  }),
  warning: warningSchema,
});

// ---------------- Catálogo de versões inexistentes ----------------

/** Valores intencionalmente diversos: numéricos fora do range, formatos
 *  ambíguos (SemVer, "v2"), aliases textuais, string vazia após trim,
 *  e chaves que colidem com propriedades de Object.prototype. */
const UNKNOWN_VERSIONS = [
  "0",
  "4",
  "99",
  "-1",
  "1.5",
  "2.0",
  "v2",
  "V2",
  "latest",
  "stable",
  "beta",
  "  ", // vira "" após trim → nenhuma fonte positiva ⇒ segue como versão vazia
  "null",
  "undefined",
  "true",
  "toString",
  "__proto__",
  "constructor",
] as const;

// ---------------- Suíte ----------------

describe("Fallback seguro para versão de schema inexistente — PATCH", () => {
  // --------------------------------------------------------------------
  // (1) Recusa por padrão: sem opt-in, qualquer versão desconhecida → 406
  //     e `persist` NUNCA é invocado.
  // --------------------------------------------------------------------
  describe("sem opt-in de fallback: 406 estrito e persist protegido", () => {
    for (const v of UNKNOWN_VERSIONS) {
      it(`Accept-Version="${v}" → 406 + persist não chamado`, async () => {
        const ctx = makeCtx();
        const res = await handlePatchTransactionVersioned(
          req({ amount: 100, total_installments: 3 }, { headers: { "Accept-Version": v } }),
          ctx,
        );
        expect(res.status).toBe(406);
        if (res.status !== 406) return;
        expect(res.body.error.code).toBe("UNSUPPORTED_VERSION");
        expect(res.body.error.message).toContain(
          SUPPORTED_VERSIONS.join(", "),
        );
        expect(res.body.error.supported).toEqual(SUPPORTED_VERSIONS);
        // Nada da versão pedida vaza para dentro do envelope.
        expect(res.body).not.toHaveProperty("schema_version");
        expect(res.body).not.toHaveProperty("data");
        expect(ctx.persist).not.toHaveBeenCalled();
      });
    }

    it("mesma versão desconhecida via ?v=… também produz 406", async () => {
      const ctx = makeCtx();
      const res = await handlePatchTransactionVersioned(
        req({ amount: 100, total_installments: 3 }, { query: { v: "42" } }),
        ctx,
      );
      expect(res.status).toBe(406);
      expect(ctx.persist).not.toHaveBeenCalled();
    });

    it("precedência preserva a intenção: Accept-Version inválido não faz downgrade para um X-Schema-Version válido", async () => {
      // Se o cliente pediu explicitamente "99" no header canônico, servir
      // "2" silenciosamente por causa do alias seria uma violação de contrato.
      const ctx = makeCtx();
      const res = await handlePatchTransactionVersioned(
        req(
          { amount: 100, total_installments: 3 },
          { headers: { "Accept-Version": "99", "X-Schema-Version": "2" } },
        ),
        ctx,
      );
      expect(res.status).toBe(406);
      expect(ctx.persist).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------
  // (2) Detector do opt-in: precisa ser explícito.
  // --------------------------------------------------------------------
  describe("wantsSafeFallback — apenas o token exato `default` ativa", () => {
    const truthy = [
      { headers: { "Accept-Version-Fallback": "default" } },
      { headers: { "accept-version-fallback": "  DEFAULT  " } },
      { query: { fallback: "default" } },
      { query: { fallback: "Default" } },
    ];
    const falsy = [
      {},
      { headers: { "Accept-Version-Fallback": "true" } },
      { headers: { "Accept-Version-Fallback": "1" } },
      { headers: { "Accept-Version-Fallback": "latest" } },
      { headers: { "Accept-Version-Fallback": "" } },
      { query: { fallback: "yes" } },
      { query: { fallback: "2" } },
    ];
    for (const opts of truthy) {
      it(`ativa: ${JSON.stringify(opts)}`, () => {
        expect(wantsSafeFallback({ ...req({}), ...opts })).toBe(true);
      });
    }
    for (const opts of falsy) {
      it(`não ativa: ${JSON.stringify(opts)}`, () => {
        expect(wantsSafeFallback({ ...req({}), ...opts })).toBe(false);
      });
    }
  });

  // --------------------------------------------------------------------
  // (3) Opt-in de fallback: degrada para DEFAULT_VERSION e mantém drift.
  // --------------------------------------------------------------------
  describe("com opt-in: 200 na DEFAULT_VERSION + warning + R1..R6", () => {
    const scenarios = [
      { label: "básico 100×3", body: { amount: 100, total_installments: 3 }, N: 3 },
      { label: "dízima 100/3 × 12", body: { amount: 100 / 3, total_installments: 12 }, N: 12 },
      { label: "half-up 1.005 × 4", body: { amount: 1.005, total_installments: 4 }, N: 4 },
      { label: "N=1", body: { amount: 199.99, total_installments: 1 }, N: 1 },
      { label: "N=36 dízima", body: { amount: 100 / 7, total_installments: 36 }, N: 36 },
    ];

    for (const s of scenarios) {
      it(`${s.label}: header opt-in serve DEFAULT_VERSION com warning`, async () => {
        const ctx = makeCtx();
        const res = (await handlePatchTransactionVersioned(
          req(s.body, {
            headers: {
              "Accept-Version": "99",
              "Accept-Version-Fallback": "default",
            },
          }),
          ctx,
        )) as Extract<VersionedResponse, { version: "2" }>;

        expect(res.status).toBe(200);
        expect(res.version).toBe(DEFAULT_VERSION);
        const parsed = fallbackBodyV2.parse(res.body);
        expect(parsed.warning.requested).toBe("99");
        expect(parsed.warning.served).toBe(DEFAULT_VERSION);
        expect(parsed.warning.supported).toEqual(SUPPORTED_VERSIONS);
        expect(parsed.data.installments).toHaveLength(s.N);
        assertDriftInvariants(parsed.data.installments);
        assertDriftMetric(parsed.data.installments, parsed.data.drift);
        expect(ctx.persist).toHaveBeenCalledTimes(1);
      });

      it(`${s.label}: query opt-in (?fallback=default) idem`, async () => {
        const ctx = makeCtx();
        const res = (await handlePatchTransactionVersioned(
          req(s.body, { query: { v: "banana", fallback: "default" } }),
          ctx,
        )) as Extract<VersionedResponse, { version: "2" }>;

        expect(res.status).toBe(200);
        expect(res.version).toBe(DEFAULT_VERSION);
        const parsed = fallbackBodyV2.parse(res.body);
        expect(parsed.warning.requested).toBe("banana");
        assertDriftInvariants(parsed.data.installments);
        assertDriftMetric(parsed.data.installments, parsed.data.drift);
      });
    }

    it("versão suportada + opt-in NÃO emite warning (opt-in é inerte)", async () => {
      const ctx = makeCtx();
      const res = (await handlePatchTransactionVersioned(
        req(
          { amount: 100, total_installments: 3 },
          {
            headers: {
              "Accept-Version": "2",
              "Accept-Version-Fallback": "default",
            },
          },
        ),
        ctx,
      )) as Extract<VersionedResponse, { version: "2" }>;
      expect(res.status).toBe(200);
      expect(res.version).toBe("2");
      expect((res.body as { warning?: unknown }).warning).toBeUndefined();
    });

    it("resultado numérico com fallback == resultado com Accept-Version=DEFAULT_VERSION direto", async () => {
      // O envelope difere (warning presente/ausente), mas o cálculo econômico
      // — installments, drift, normalized — deve ser byte-a-byte idêntico.
      const body = { amount: 100 / 3, total_installments: 12 };
      const withFallback = (await handlePatchTransactionVersioned(
        req(body, {
          headers: { "Accept-Version": "0", "Accept-Version-Fallback": "default" },
        }),
        makeCtx(),
      )) as Extract<VersionedResponse, { version: "2" }>;
      const direct = (await handlePatchTransactionVersioned(
        req(body, { headers: { "Accept-Version": DEFAULT_VERSION } }),
        makeCtx(),
      )) as Extract<VersionedResponse, { version: "2" }>;

      expect(withFallback.status).toBe(200);
      expect(direct.status).toBe(200);
      expect(withFallback.body.data.installments).toEqual(direct.body.data.installments);
      expect(withFallback.body.data.drift).toEqual(direct.body.data.drift);
      expect(withFallback.body.data.normalized).toEqual(direct.body.data.normalized);
    });
  });

  // --------------------------------------------------------------------
  // (4) Erros de validação com fallback: 422 permanece 422 (sem warning).
  // --------------------------------------------------------------------
  it("payload inválido + fallback opt-in ainda retorna 422 canônico (sem warning)", async () => {
    const ctx = makeCtx();
    const res = await handlePatchTransactionVersioned(
      req(
        { amount: -1, total_installments: 3 },
        {
          headers: {
            "Accept-Version": "99",
            "Accept-Version-Fallback": "default",
          },
        },
      ),
      ctx,
    );
    expect(res.status).toBe(422);
    if (res.status !== 422) return;
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect((res.body as unknown as { warning?: unknown }).warning).toBeUndefined();
    expect(ctx.persist).not.toHaveBeenCalled();
  });
});
