/**
 * Contrato PATCH — versionamento de schema.
 *
 * A resposta 200 do endpoint PATCH é consumida por múltiplos clientes que
 * podem estar em versões distintas (web atual, apps móveis antigos, workers
 * de conciliação legados). Este teste fixa o CONTRATO por versão e garante:
 *
 *   V1 (baseline / legado) — clientes antigos leem apenas o essencial:
 *     data.id: string
 *     data.installments: Array<{ installment_number, total_installments,
 *                                amount, installment_source_amount,
 *                                installment_mode }>
 *
 *   V2 (atual) — adiciona `normalized` e `drift` sem remover nada de V1:
 *     + data.normalized: Record<string, unknown> (subset do allowlist)
 *     + data.drift: { sum, source, delta, tolerance, ok }
 *
 *   V3 (futuro hipotético) — apenas ADIÇÕES não-quebrantes são permitidas.
 *     Clientes V1/V2 seguem funcionando; nenhum campo obrigatório removido.
 *
 * Regras invariantes preservadas em toda versão:
 *   R1. `installments.length === total_installments` de cada linha.
 *   R2. Numeração 1..N contígua.
 *   R3. Cada parcela com ≤ 2 casas decimais.
 *   R4. Modo idêntico em toda parcela do grupo.
 *   R5. Drift regulamentar: |Σparcelas − source| ≤ N × 1¢.
 *   R6. `drift.tolerance === N × 0.01` e `drift.ok === true` (quando 200).
 *
 * A abordagem usa Zod strict/passthrough para modelar cada versão e
 * confirma que a resposta ATUAL passa em TODAS as versões suportadas,
 * simulando parsers de clientes distintos consumindo o mesmo payload.
 */
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import {
  handlePatchTransactionContract,
  type PatchContractResponse,
  type InstallmentPreview,
} from "@/lib/patch-transaction-contract";

const toCents = (n: number) => Math.round(n * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------- Schemas por versão ----------------

/** V1: apenas campos obrigatórios para clientes legados. `passthrough`
 *  significa que campos extras são tolerados (forward-compat). */
const installmentV1 = z
  .object({
    installment_number: z.number().int().min(1),
    total_installments: z.number().int().min(1),
    amount: z.number().nonnegative(),
    installment_source_amount: z.number().nonnegative(),
    installment_mode: z.enum(["divide", "fixed"]),
  })
  .passthrough();

const responseV1 = z
  .object({
    data: z
      .object({
        id: z.string().min(1),
        installments: z.array(installmentV1).min(1),
      })
      .passthrough(),
  })
  .passthrough();

/** V2: adiciona `normalized` e `drift`. */
const driftV2 = z
  .object({
    sum: z.number(),
    source: z.number(),
    delta: z.number().nonnegative(),
    tolerance: z.number().nonnegative(),
    ok: z.boolean(),
  })
  .passthrough();

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
] as const;

const normalizedV2 = z.record(z.string(), z.unknown()).superRefine((obj, ctx) => {
  for (const key of Object.keys(obj)) {
    if (!(NORMALIZED_ALLOWLIST as readonly string[]).includes(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `key '${key}' fora do allowlist`,
      });
    }
  }
});

const responseV2 = z
  .object({
    data: z
      .object({
        id: z.string().min(1),
        normalized: normalizedV2,
        installments: z.array(installmentV1).min(1),
        drift: driftV2,
      })
      .passthrough(),
  })
  .passthrough();

/** V3 hipotético: espelha V2. Um cliente V3 aceita tudo que V2 aceita.
 *  Se acrescentarmos campos futuros, eles entram como `.optional()` aqui,
 *  nunca como required — do contrário quebraria clientes antigos. */
const responseV3 = responseV2;

// ---------------- Helpers ----------------

function req(body: unknown, id = "ver-tx") {
  return {
    method: "PATCH",
    id,
    contentType: "application/json",
    rawBody: JSON.stringify(body),
  };
}

async function patch(
  body: unknown,
  currentRow: Parameters<typeof handlePatchTransactionContract>[1]["currentRow"] = null,
): Promise<PatchContractResponse> {
  const persist = vi.fn(async (id: string, p: Record<string, unknown>) => ({ id, ...p }));
  return handlePatchTransactionContract(req(body), { persist, currentRow });
}

/** Aplica as regras R1..R6 sobre qualquer body parseado. */
function assertDriftRules(body: {
  data: {
    installments: Array<{
      installment_number: number;
      total_installments: number;
      amount: number;
      installment_source_amount: number;
      installment_mode: "divide" | "fixed";
    }>;
    drift?: { sum: number; source: number; delta: number; tolerance: number; ok: boolean };
  };
}) {
  const { installments, drift } = body.data;
  const N = installments.length;

  // R1 / R2
  expect(N).toBeGreaterThanOrEqual(1);
  for (const r of installments) expect(r.total_installments).toBe(N);
  const nums = installments.map((r) => r.installment_number).sort((a, b) => a - b);
  expect(nums).toEqual(Array.from({ length: N }, (_, i) => i + 1));

  // R3 / R4
  const mode = installments[0].installment_mode;
  for (const r of installments) {
    expect(r.installment_mode).toBe(mode);
    expect(Math.round(r.amount * 100) / 100).toBe(r.amount);
  }

  // R5 (regulamentar) — vale mesmo para clientes V1 que não têm o drift metric.
  const source = installments[0].installment_source_amount;
  const sumCents = installments.reduce((s, r) => s + toCents(r.amount), 0);
  expect(Math.abs(sumCents - toCents(source))).toBeLessThanOrEqual(N);

  // R6 — só quando drift está presente (V2+)
  if (drift) {
    expect(drift.tolerance).toBe(round2(N * 0.01));
    expect(drift.ok).toBe(true);
    expect(toCents(drift.sum)).toBe(sumCents);
  }
}

// ---------------- Suíte ----------------

// Cenários que estressam arredondamento e o allowlist do `normalized`.
const scenarios: Array<{
  label: string;
  body: Record<string, unknown>;
  currentRow?: Parameters<typeof patch>[1];
  expectedN: number;
}> = [
  { label: "básico (100 × 3)", body: { amount: 100, total_installments: 3 }, expectedN: 3 },
  { label: "dízima 100/3 × 12", body: { amount: 100 / 3, total_installments: 12 }, expectedN: 12 },
  { label: "half-up 1.005 × 4", body: { amount: 1.005, total_installments: 4 }, expectedN: 4 },
  { label: "N=1", body: { amount: 199.99, total_installments: 1 }, expectedN: 1 },
  { label: "N=36 dízima", body: { amount: 100 / 7, total_installments: 36 }, expectedN: 36 },
  {
    label: "modo fixed",
    body: { amount: 250 },
    currentRow: { amount: 250, total_installments: 6, installment_mode: "fixed" },
    expectedN: 6,
  },
  {
    label: "patch parcial (só N)",
    body: { total_installments: 8 },
    currentRow: { amount: 999.99, total_installments: 1, installment_source_amount: 999.99 },
    expectedN: 8,
  },
];

describe("Contrato PATCH — versionamento de schema", () => {
  for (const s of scenarios) {
    describe(s.label, () => {
      it("resposta atual satisfaz V1 (parser legado)", async () => {
        const res = await patch(s.body, s.currentRow ?? null);
        expect(res.status).toBe(200);
        if (res.status !== 200) return;
        const parsed = responseV1.parse(res.body);
        expect(parsed.data.installments).toHaveLength(s.expectedN);
        assertDriftRules(parsed as Parameters<typeof assertDriftRules>[0]);
      });

      it("resposta atual satisfaz V2 (parser atual)", async () => {
        const res = await patch(s.body, s.currentRow ?? null);
        expect(res.status).toBe(200);
        if (res.status !== 200) return;
        const parsed = responseV2.parse(res.body);
        expect(parsed.data.installments).toHaveLength(s.expectedN);
        assertDriftRules(parsed as Parameters<typeof assertDriftRules>[0]);
      });

      it("resposta atual satisfaz V3 (parser futuro compatível)", async () => {
        const res = await patch(s.body, s.currentRow ?? null);
        expect(res.status).toBe(200);
        if (res.status !== 200) return;
        const parsed = responseV3.parse(res.body);
        assertDriftRules(parsed as Parameters<typeof assertDriftRules>[0]);
      });
    });
  }

  it("normalized nunca expõe chaves fora do allowlist (allowlist é o contrato)", async () => {
    // Tenta injetar chaves não-permitidas junto com um payload válido.
    const res = await patch({
      amount: 100,
      total_installments: 3,
      __proto__: { polluted: true },
      constructor: { evil: 1 },
      arbitrary_field: "x",
      role: "admin",
    });
    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    // O parser V2 rejeita chaves fora do allowlist — se o handler tivesse
    // vazado alguma, este .parse quebraria com um erro descritivo.
    const parsed = responseV2.parse(res.body);
    for (const key of Object.keys(parsed.data.normalized)) {
      expect((NORMALIZED_ALLOWLIST as readonly string[]).includes(key)).toBe(true);
    }
  });

  it("compatibilidade V1↔V2: o parser V1 ignora `normalized`/`drift` sem quebrar", async () => {
    const res = await patch({ amount: 12.34, total_installments: 5 });
    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    // Simula um cliente antigo: parseia com V1 e usa só os campos legados.
    const legacy = responseV1.parse(res.body);
    expect(legacy.data.id).toBeTruthy();
    expect(legacy.data.installments.length).toBe(5);
    // O drift continua respeitando a regra regulamentar mesmo sem que o cliente o leia.
    assertDriftRules(legacy as Parameters<typeof assertDriftRules>[0]);
  });

  it("forward-compat: campos adicionais no futuro não invalidam V1/V2 (passthrough)", async () => {
    // Simulamos uma resposta "V3" enriquecendo o payload com campos hipotéticos
    // (currency, schema_version) e verificamos que ambos os parsers antigos
    // continuam aceitando-a graças a `.passthrough()`.
    const base = await patch({ amount: 199.99, total_installments: 6 });
    expect(base.status).toBe(200);
    if (base.status !== 200) return;

    const future = {
      ...base.body,
      data: {
        ...base.body.data,
        schema_version: "2026-01",
        currency: "BRL",
        _meta: { hint: "future field" },
      },
    };

    // Ambos os parsers antigos aceitam o payload enriquecido.
    expect(() => responseV1.parse(future)).not.toThrow();
    expect(() => responseV2.parse(future)).not.toThrow();
    // E as regras de drift continuam válidas.
    assertDriftRules(future as Parameters<typeof assertDriftRules>[0]);
  });

  it("backward-break bloqueado: remover um campo obrigatório de V1 é detectado", async () => {
    // Se um dia o handler removesse `installment_source_amount` das linhas,
    // clientes V1 quebrariam. Simulamos o cenário e confirmamos que o
    // schema V1 detecta a incompatibilidade.
    const res = await patch({ amount: 100, total_installments: 3 });
    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    const mutilated = {
      ...res.body,
      data: {
        ...res.body.data,
        installments: res.body.data.installments.map((r) => {
          const {
            installment_source_amount: _drop,
            ...rest
          } = r as unknown as Record<string, unknown>;
          void _drop;
          return rest;
        }),
      },
    };
    expect(() => responseV1.parse(mutilated)).toThrow();
    expect(() => responseV2.parse(mutilated)).toThrow();
  });

  it("regras de drift são invariantes de versão (varredura N ∈ [1..24])", async () => {
    for (let N = 1; N <= 24; N++) {
      const res = await patch({ amount: 100 / 3, total_installments: N });
      expect(res.status).toBe(200);
      if (res.status !== 200) continue;
      const v1 = responseV1.parse(res.body);
      const v2 = responseV2.parse(res.body);
      assertDriftRules(v1 as Parameters<typeof assertDriftRules>[0]);
      assertDriftRules(v2 as Parameters<typeof assertDriftRules>[0]);
    }
  });
});
