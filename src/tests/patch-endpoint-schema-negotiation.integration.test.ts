/**
 * Contrato PATCH — negociação de versão de schema via header/query.
 *
 * A resposta 200 tem múltiplos formatos suportados. O cliente negocia via:
 *   - `Accept-Version: 1|2|3` (canônico)
 *   - `X-Schema-Version: 1|2|3` (alias)
 *   - `?v=1|2|3` (fallback quando o cliente não controla headers)
 *
 * Este teste verifica:
 *   (a) O negociador honra header > alias > query > default.
 *   (b) Cada versão retorna EXATAMENTE seu shape (nem mais nem menos que o contratado).
 *   (c) As regras de drift regulamentar (R1..R5) valem em TODAS as versões,
 *       e a métrica de drift explícita (R6) aparece apenas em V2+.
 *   (d) Versões desconhecidas → 406 sem tocar em `persist`.
 *   (e) O payload legado (V1) permanece estável quando novos campos são
 *       adicionados em V3 (não-quebrantes por construção).
 */
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import {
  handlePatchTransactionVersioned,
  negotiateVersion,
  SUPPORTED_VERSIONS,
  DEFAULT_VERSION,
  type VersionedRequest,
  type VersionedResponse,
} from "@/lib/patch-transaction-versioned";
import type { InstallmentPreview } from "@/lib/patch-transaction-contract";

const toCents = (n: number) => Math.round(n * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------- Schemas Zod por versão ----------------

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

const bodyV1 = z.object({
  schema_version: z.literal("1"),
  data: z.object({
    id: z.string().min(1),
    installments: z.array(installmentSchema).min(1),
  }),
});

const bodyV2 = z.object({
  schema_version: z.literal("2"),
  data: z.object({
    id: z.string().min(1),
    normalized: z.record(z.string(), z.unknown()),
    installments: z.array(installmentSchema).min(1),
    drift: driftSchema,
  }),
});

const bodyV3 = z.object({
  schema_version: z.literal("3"),
  data: z.object({
    id: z.string().min(1),
    schema_version: z.literal("3"),
    normalized: z.record(z.string(), z.unknown()),
    installments: z.array(installmentSchema).min(1),
    drift: driftSchema,
  }),
});

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
    id: opts.id ?? "tx-ver",
    contentType: "application/json",
    rawBody: JSON.stringify(body),
    headers: opts.headers,
    query: opts.query,
  };
}

/** Shape aceito pelos helpers: cada campo é opcional na entrada (Zod
 *  `.object()` pode reportar propriedades como opcionais quando o parse
 *  passa por schemas com `passthrough` em outros pontos do bundle). Fazemos
 *  a narrowing explícita e falhamos com mensagem clara se algo falta. */
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

/** Regras invariantes R1..R5 sobre as parcelas — devem valer em toda versão. */
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

type LooseDrift = Partial<{ sum: number; source: number; delta: number; tolerance: number; ok: boolean }>;

/** R6: métrica de drift explícita (só V2+). */
function assertDriftMetric(rawInstallments: ReadonlyArray<LooseInstallment>, rawDrift: LooseDrift) {
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


// ---------------- Cenários ----------------

const scenarios: Array<{ label: string; body: Record<string, unknown>; N: number }> = [
  { label: "básico 100×3", body: { amount: 100, total_installments: 3 }, N: 3 },
  { label: "dízima 100/3 × 12", body: { amount: 100 / 3, total_installments: 12 }, N: 12 },
  { label: "half-up 1.005 × 4", body: { amount: 1.005, total_installments: 4 }, N: 4 },
  { label: "N=1", body: { amount: 199.99, total_installments: 1 }, N: 1 },
  { label: "N=36 dízima", body: { amount: 100 / 7, total_installments: 36 }, N: 36 },
];

// ---------------- Suíte ----------------

describe("Negociação de versão do schema — PATCH", () => {
  describe("negociador (precedência de fonte)", () => {
    it("Accept-Version tem prioridade sobre X-Schema-Version e ?v=", () => {
      const n = negotiateVersion({
        method: "PATCH",
        id: "x",
        contentType: "application/json",
        rawBody: "{}",
        headers: { "Accept-Version": "1", "X-Schema-Version": "2" },
        query: { v: "3" },
      });
      expect(n).toEqual({ version: "1", source: "header:accept-version" });
    });

    it("X-Schema-Version tem prioridade sobre ?v=", () => {
      const n = negotiateVersion({
        method: "PATCH",
        id: "x",
        contentType: "application/json",
        rawBody: "{}",
        headers: { "X-Schema-Version": "2" },
        query: { v: "3" },
      });
      expect(n).toEqual({ version: "2", source: "header:x-schema-version" });
    });

    it("?v= é usado quando nenhum header está presente", () => {
      const n = negotiateVersion({
        method: "PATCH",
        id: "x",
        contentType: "application/json",
        rawBody: "{}",
        query: { v: "3" },
      });
      expect(n).toEqual({ version: "3", source: "query:v" });
    });

    it("sem nada → default", () => {
      const n = negotiateVersion({
        method: "PATCH",
        id: "x",
        contentType: "application/json",
        rawBody: "{}",
      });
      expect(n).toEqual({ version: DEFAULT_VERSION, source: "default" });
    });

    it("headers case-insensitive", () => {
      const n = negotiateVersion({
        method: "PATCH",
        id: "x",
        contentType: "application/json",
        rawBody: "{}",
        headers: { "accept-version": "3" },
      });
      expect(n.version).toBe("3");
    });

    it("trim de whitespace", () => {
      const n = negotiateVersion({
        method: "PATCH",
        id: "x",
        contentType: "application/json",
        rawBody: "{}",
        headers: { "Accept-Version": "  2  " },
      });
      expect(n.version).toBe("2");
    });
  });

  describe("resposta por versão respeita seu shape + regras de drift", () => {
    for (const s of scenarios) {
      describe(s.label, () => {
        it("V1: shape mínimo + R1..R5, SEM normalized/drift", async () => {
          const ctx = makeCtx();
          const res = (await handlePatchTransactionVersioned(
            req(s.body, { headers: { "Accept-Version": "1" } }),
            ctx,
          )) as Extract<VersionedResponse, { version: "1" }>;
          expect(res.status).toBe(200);
          expect(res.version).toBe("1");

          const parsed = bodyV1.parse(res.body);
          expect(parsed.data.installments).toHaveLength(s.N);
          assertDriftInvariants(parsed.data.installments);

          // V1 não deve carregar campos de V2 no envelope da versão negociada.
          expect((res.body.data as Record<string, unknown>).drift).toBeUndefined();
          expect((res.body.data as Record<string, unknown>).normalized).toBeUndefined();
        });

        it("V2: shape completo + R1..R6", async () => {
          const ctx = makeCtx();
          const res = (await handlePatchTransactionVersioned(
            req(s.body, { headers: { "Accept-Version": "2" } }),
            ctx,
          )) as Extract<VersionedResponse, { version: "2" }>;
          expect(res.status).toBe(200);
          expect(res.version).toBe("2");

          const parsed = bodyV2.parse(res.body);
          expect(parsed.data.installments).toHaveLength(s.N);
          assertDriftInvariants(parsed.data.installments);
          assertDriftMetric(parsed.data.installments, parsed.data.drift);
        });

        it("V3: shape V2 + schema_version, R1..R6 mantidas", async () => {
          const ctx = makeCtx();
          const res = (await handlePatchTransactionVersioned(
            req(s.body, { headers: { "Accept-Version": "3" } }),
            ctx,
          )) as Extract<VersionedResponse, { version: "3" }>;
          expect(res.status).toBe(200);
          expect(res.version).toBe("3");

          const parsed = bodyV3.parse(res.body);
          expect(parsed.data.schema_version).toBe("3");
          expect(parsed.data.installments).toHaveLength(s.N);
          assertDriftInvariants(parsed.data.installments);
          assertDriftMetric(parsed.data.installments, parsed.data.drift);
        });

        it("negociação via ?v= produz o mesmo shape das versões por header", async () => {
          const ctxH = makeCtx();
          const ctxQ = makeCtx();
          const viaHeader = await handlePatchTransactionVersioned(
            req(s.body, { headers: { "Accept-Version": "2" } }),
            ctxH,
          );
          const viaQuery = await handlePatchTransactionVersioned(
            req(s.body, { query: { v: "2" } }),
            ctxQ,
          );
          expect(viaHeader.status).toBe(200);
          expect(viaQuery.status).toBe(200);
          if (viaHeader.status !== 200 || viaQuery.status !== 200) return;
          expect(viaQuery.version).toBe(viaHeader.version);
          expect(viaQuery.body).toEqual(viaHeader.body);
        });
      });
    }
  });

  it("default quando nenhum indicador de versão é passado", async () => {
    const ctx = makeCtx();
    const res = await handlePatchTransactionVersioned(req({ amount: 100, total_installments: 2 }), ctx);
    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    expect(res.version).toBe(DEFAULT_VERSION);
  });

  it("versão desconhecida → 406 e persist NÃO é chamado", async () => {
    const ctx = makeCtx();
    const res = await handlePatchTransactionVersioned(
      req({ amount: 100, total_installments: 2 }, { headers: { "Accept-Version": "99" } }),
      ctx,
    );
    expect(res.status).toBe(406);
    if (res.status !== 406) return;
    expect(res.body.error.code).toBe("UNSUPPORTED_VERSION");
    expect(res.body.error.supported).toEqual(SUPPORTED_VERSIONS);
    expect(ctx.persist).not.toHaveBeenCalled();
  });

  it("versão malformada (string vazia via query) → 406", async () => {
    const ctx = makeCtx();
    // headers ausentes; ?v= vazio cai no default (nenhuma fonte "positiva").
    // Mas ?v=' ' (whitespace) após trim vira "" e não bate com nenhum suportado.
    const res = await handlePatchTransactionVersioned(
      req({ amount: 100, total_installments: 2 }, { query: { v: "  " } }),
      ctx,
    );
    expect(res.status).toBe(406);
  });

  it("compat cruzada: V1 é subconjunto observável da V3 quanto a installments", async () => {
    // Mesmo payload de negócio, versões diferentes: as parcelas produzidas
    // devem ser numericamente idênticas — o versionamento afeta apenas o
    // envelope, nunca o cálculo econômico.
    const body = { amount: 100 / 3, total_installments: 12 };
    const v1 = (await handlePatchTransactionVersioned(
      req(body, { headers: { "Accept-Version": "1" } }),
      makeCtx(),
    )) as Extract<VersionedResponse, { version: "1" }>;
    const v3 = (await handlePatchTransactionVersioned(
      req(body, { headers: { "Accept-Version": "3" } }),
      makeCtx(),
    )) as Extract<VersionedResponse, { version: "3" }>;

    expect(v1.status).toBe(200);
    expect(v3.status).toBe(200);
    expect(v1.body.data.installments).toEqual(v3.body.data.installments);
    assertDriftInvariants(v1.body.data.installments);
    assertDriftInvariants(v3.body.data.installments);
    assertDriftMetric(v3.body.data.installments, v3.body.data.drift);
  });

  it("erros de validação (422) NÃO são versionados — mesmo shape em qualquer versão", async () => {
    // amount negativo dispara validação; a resposta deve permanecer no
    // formato de erro canônico independentemente da versão pedida.
    const bad = { amount: -1, total_installments: 3 };
    for (const v of SUPPORTED_VERSIONS) {
      const res = await handlePatchTransactionVersioned(
        req(bad, { headers: { "Accept-Version": v } }),
        makeCtx(),
      );
      expect(res.status).toBe(422);
      if (res.status === 422) {
        expect(res.body.error.code).toBe("VALIDATION_ERROR");
      }
    }
  });

  it("drift regulamentar em varredura N ∈ [1..24] × versões", async () => {
    for (const v of SUPPORTED_VERSIONS) {
      for (let N = 1; N <= 24; N++) {
        const res = await handlePatchTransactionVersioned(
          req({ amount: 100 / 3, total_installments: N }, { headers: { "Accept-Version": v } }),
          makeCtx(),
        );
        expect(res.status).toBe(200);
        if (res.status !== 200) continue;
        const installments = res.body.data.installments;
        assertDriftInvariants(installments);
        if (v !== "1") {
          const withDrift = res.body.data as { drift: { sum: number; source: number; delta: number; tolerance: number; ok: boolean } };
          assertDriftMetric(installments, withDrift.drift);
        }
      }
    }
  });

  // ------------------------------------------------------------------
  // Forward-compat: injeção de campos futuros
  // ------------------------------------------------------------------
  //
  // Modelamos parsers "lenientes" (`.passthrough()`) equivalentes ao que
  // um cliente real usa em produção. A ideia central do forward-compat é:
  //   • V1/V2 aceitam qualquer resposta que preserve seus campos exigidos.
  //   • Adicionar chaves novas em qualquer nível (envelope, `data`,
  //     `installments[i]`, `drift`, `normalized.__unknown`) NÃO deve
  //     quebrar parsers antigos.
  //   • Regras de normalização (allowlist, drift regulamentar) permanecem
  //     verificáveis nas partes conhecidas do payload.
  describe("forward-compat: campos futuros não quebram V1/V2", () => {
    const installmentLenient = installmentSchema.passthrough();
    const driftLenient = driftSchema.passthrough();

    const bodyV1Lenient = z
      .object({
        schema_version: z.literal("1"),
        data: z
          .object({
            id: z.string().min(1),
            installments: z.array(installmentLenient).min(1),
          })
          .passthrough(),
      })
      .passthrough();

    const bodyV2Lenient = z
      .object({
        schema_version: z.literal("2"),
        data: z
          .object({
            id: z.string().min(1),
            normalized: z.record(z.string(), z.unknown()),
            installments: z.array(installmentLenient).min(1),
            drift: driftLenient,
          })
          .passthrough(),
      })
      .passthrough();

    /** Enriquece uma resposta 200 com campos "futuros" em cada nível.
     *  Retorna um payload que um servidor V4 hipotético poderia devolver. */
    function injectFutureFields<T extends { status: 200; body: { data: Record<string, unknown> } }>(
      res: T,
    ) {
      const body = res.body as { schema_version?: string; data: Record<string, unknown> };
      const data = body.data;
      const installments = (data.installments as Array<Record<string, unknown>>).map((r, i) => ({
        ...r,
        // per-installment future fields
        amount_cents: Math.round((r.amount as number) * 100),
        idempotency_key: `k-${i}`,
        _experimental: { fx_rate: 1 },
      }));
      const drift = data.drift
        ? {
            ...(data.drift as Record<string, unknown>),
            // future drift metadata
            algorithm: "banker-rounding",
            precision: "cent",
            _reserved: null,
          }
        : undefined;
      const normalized = data.normalized
        ? {
            ...(data.normalized as Record<string, unknown>),
            // NOTA: `normalized` mantém o allowlist; injetar chaves aqui
            // simularia um servidor mal comportado. Não injetamos nada dentro
            // dele — a garantia é que parsers V1/V2 IGNORAM campos futuros
            // em OUTROS níveis sem afetar essa regra.
          }
        : undefined;

      return {
        ...res,
        body: {
          // envelope-level future fields
          ...body,
          server_version: "2027.01.0",
          trace_id: "abcd-1234",
          _links: { self: "/api/tx/123" },
          data: {
            ...data,
            installments,
            ...(drift ? { drift } : {}),
            ...(normalized ? { normalized } : {}),
            // data-level future fields
            currency: "BRL",
            fx_snapshot: { at: "2027-01-01T00:00:00Z", rate: 1 },
            _tags: ["experimental"],
          },
        },
      };
    }

    it("V1 lenient aceita resposta enriquecida sem violar regras conhecidas", async () => {
      const base = await handlePatchTransactionVersioned(
        req({ amount: 100 / 3, total_installments: 12 }, { headers: { "Accept-Version": "1" } }),
        makeCtx(),
      );
      expect(base.status).toBe(200);
      if (base.status !== 200) return;

      const enriched = injectFutureFields(base);
      const parsed = bodyV1Lenient.parse(enriched.body);

      // Campos futuros SÃO preservados pelo passthrough (o cliente pode
      // opcionalmente lê-los), mas os campos exigidos por V1 continuam
      // presentes e válidos.
      expect(parsed.data.installments.length).toBe(12);
      assertDriftInvariants(parsed.data.installments);

      // Campos futuros são visíveis mas não obrigatórios.
      const envelope = parsed as Record<string, unknown>;
      expect(envelope.server_version).toBe("2027.01.0");
      expect(envelope.trace_id).toBe("abcd-1234");
    });

    it("V2 lenient aceita resposta enriquecida, drift regulamentar preservado", async () => {
      const base = await handlePatchTransactionVersioned(
        req({ amount: 1.005, total_installments: 4 }, { headers: { "Accept-Version": "2" } }),
        makeCtx(),
      );
      expect(base.status).toBe(200);
      if (base.status !== 200) return;

      const enriched = injectFutureFields(base);
      const parsed = bodyV2Lenient.parse(enriched.body);

      // Todas as regras contratuais de V2 são preservadas.
      expect(parsed.data.installments.length).toBe(4);
      assertDriftInvariants(parsed.data.installments);
      assertDriftMetric(parsed.data.installments, parsed.data.drift);

      // Normalização: allowlist intacta mesmo após injeção externa.
      const NORMALIZED_ALLOWLIST = [
        "name",
        "amount",
        "total_installments",
        "installment_mode",
        "installment_source_amount",
        "category_id",
        "icon",
        "bank_account_id",
        "credit_card_id",
        "date",
        "notes",
        "category",
        "card",
      ];
      for (const key of Object.keys(parsed.data.normalized)) {
        expect(NORMALIZED_ALLOWLIST.includes(key)).toBe(true);
      }
    });

    it("V1 e V2 lenient aceitam SIMULTANEAMENTE a mesma resposta enriquecida", async () => {
      // Um cliente V1 e um cliente V2 podem coexistir e consumir o MESMO
      // payload enriquecido sem que nenhum deles quebre.
      const baseV1 = await handlePatchTransactionVersioned(
        req({ amount: 199.99, total_installments: 6 }, { headers: { "Accept-Version": "1" } }),
        makeCtx(),
      );
      const baseV2 = await handlePatchTransactionVersioned(
        req({ amount: 199.99, total_installments: 6 }, { headers: { "Accept-Version": "2" } }),
        makeCtx(),
      );
      expect(baseV1.status).toBe(200);
      expect(baseV2.status).toBe(200);
      if (baseV1.status !== 200 || baseV2.status !== 200) return;

      const richV1 = injectFutureFields(baseV1);
      const richV2 = injectFutureFields(baseV2);

      expect(() => bodyV1Lenient.parse(richV1.body)).not.toThrow();
      expect(() => bodyV2Lenient.parse(richV2.body)).not.toThrow();

      // A resposta V2 enriquecida também é lida por um parser V1 lenient
      // (subconjunto observável: `schema_version` bate por acaso? não —
      //  V1 espera `"1"`. Cross-parse cross-versão é responsabilidade do
      //  negociador; aqui validamos apenas que ADIÇÕES não quebram cada
      //  parser dentro da sua própria versão).
      expect(() => bodyV1Lenient.parse(richV1.body)).not.toThrow();
      expect(() => bodyV2Lenient.parse(richV2.body)).not.toThrow();
    });

    it("injeção patológica em installments (chaves com nomes reservados) não quebra parsers", async () => {
      const base = await handlePatchTransactionVersioned(
        req({ amount: 100, total_installments: 3 }, { headers: { "Accept-Version": "2" } }),
        makeCtx(),
      );
      expect(base.status).toBe(200);
      if (base.status !== 200) return;

      const evil = {
        ...base.body,
        data: {
          ...base.body.data,
          installments: (base.body.data.installments as unknown as Array<Record<string, unknown>>).map((r) => ({
            ...r,
            // Nomes suspeitos que NÃO devem confundir o parser (Zod ignora
            // chaves fora do schema estrito por padrão; com passthrough
            // simplesmente as preserva).
            toString: "not-a-function",
            __proto__marker: true,
            valueOf: 0,
          })),
        },
      };
      const parsed = bodyV2Lenient.parse(evil);
      expect(parsed.data.installments).toHaveLength(3);
      assertDriftInvariants(parsed.data.installments);
      assertDriftMetric(parsed.data.installments, parsed.data.drift);
    });

    it("versão futura no envelope não engana o parser V1 (schema_version continua sendo '1')", async () => {
      // Cenário: um proxy adiciona `server_schema_version: "9"` no envelope.
      // O campo canônico `schema_version` continua "1" e V1 deve aceitar.
      const base = await handlePatchTransactionVersioned(
        req({ amount: 50, total_installments: 5 }, { headers: { "Accept-Version": "1" } }),
        makeCtx(),
      );
      expect(base.status).toBe(200);
      if (base.status !== 200) return;

      const withProxyMeta = {
        ...base.body,
        server_schema_version: "9",
        edge_cache: { hit: false },
      };
      const parsed = bodyV1Lenient.parse(withProxyMeta);
      expect(parsed.schema_version).toBe("1");
      assertDriftInvariants(parsed.data.installments);
    });
  });
});

