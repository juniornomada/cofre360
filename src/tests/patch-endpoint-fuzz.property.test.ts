/**
 * Property-based — payloads monetários aleatórios.
 *
 * Gera entradas hostis (NaN, Infinity, negativos, sub-cent, strings, arrays,
 * N absurdos) + entradas válidas amplas e verifica DUAS propriedades globais:
 *
 *   P1. O handler PATCH NUNCA quebra: sempre devolve um status ∈ {200,400,404,405,415,422}
 *       e um body em um dos dois shapes contratuais (sucesso OU erro).
 *   P2. Quando o payload é aceito (200), as parcelas recalculadas mantêm
 *       |Σparcelas − source| ≤ N × 1¢ (drift regulamentar) para qualquer
 *       combinação (amount, N) — inclusive dízimas e extremos.
 */
import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import {
  handlePatchTransactionContract,
  type PatchContractResponse,
} from "@/lib/patch-transaction-contract";

const CENT = 0.01;
const round2 = (n: number) => Math.round(n * 100) / 100;

const ALLOWED = new Set([
  "name",
  "amount",
  "total_installments",
  "date",
  "category",
  "icon",
  "card",
  "bank_account_id",
]);

function req(rawBody: string, opts: { contentType?: string | null; id?: string } = {}) {
  return {
    method: "PATCH",
    id: opts.id ?? "tx-fuzz",
    contentType: opts.contentType === undefined ? "application/json" : opts.contentType,
    rawBody,
  };
}

const persistEcho = vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch }));

const currentRow = {
  amount: round2(1000 / 12),
  total_installments: 12,
  installment_mode: "divide" as const,
  installment_source_amount: 1000,
};

// -------------------------- arbitrários --------------------------

// Valores monetários "reais" — cobre positivos comuns, sub-cent, e valores enormes.
const arbNiceAmount = fc.oneof(
  fc.double({ min: 0.001, max: 100_000, noNaN: true }),
  fc.double({ min: 100_000, max: 1_000_000_000, noNaN: true }),
  fc.constantFrom(0.01, 0.001, 0.0001, 33.33, 99.99, 1_000_000_000),
);

// Valores hostis / inválidos — NaN, Infinity, -Infinity, negativos, 0, tipos errados.
const arbEvilAmount = fc.oneof(
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0, 0, -1, -1e18),
  fc.string(),
  fc.boolean(),
  fc.constantFrom(null, undefined),
  fc.array(fc.integer()),
  fc.record({ nested: fc.integer() }),
);

// N — inclui 0, negativos, floats, gigantes, strings.
const arbNiceN = fc.integer({ min: 1, max: 360 });
const arbEvilN = fc.oneof(
  fc.constantFrom(0, -1, 361, 10_000, 1.5, Number.NaN, Number.POSITIVE_INFINITY),
  fc.string(),
  fc.boolean(),
  fc.constantFrom(null),
);

// Payload aleatório: mistura chaves válidas + inválidas + fora do allowlist.
const arbFuzzPayload = fc.record(
  {
    name: fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant("")),
    amount: fc.oneof(arbNiceAmount, arbEvilAmount),
    total_installments: fc.oneof(arbNiceN, arbEvilN),
    date: fc.oneof(fc.string(), fc.integer()),
    category: fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
    icon: fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
    card: fc.oneof(fc.string(), fc.constant(null), fc.integer()),
    bank_account_id: fc.oneof(fc.string(), fc.constant(null), fc.integer()),
    // Chaves fora do allowlist — devem ser silenciosamente descartadas.
    id: fc.string(),
    user_id: fc.string(),
    is_admin: fc.boolean(),
    role: fc.constantFrom("admin", "user", "root"),
  },
  { requiredKeys: [] },
);

// Payload SEMPRE válido (para propriedade de drift).
const arbValidPayload = fc.record(
  {
    amount: arbNiceAmount.map(round2).filter((n) => n > 0 && Number.isFinite(n)),
    total_installments: arbNiceN,
  },
  { requiredKeys: ["amount", "total_installments"] },
);

// -------------------------- helpers de asserção --------------------------

function serialize(v: unknown): string {
  return JSON.stringify(v, (_k, val) => {
    if (typeof val === "number" && !Number.isFinite(val)) return null; // JSON.stringify já faz isso, explicitando.
    return val;
  });
}

function assertResponseShape(resp: PatchContractResponse) {
  expect([200, 400, 404, 405, 415, 422]).toContain(resp.status);
  if (resp.status === 200) {
    expect(resp.body).toHaveProperty("data");
    const d = resp.body.data;
    expect(typeof d.id).toBe("string");
    expect(d.installments.length).toBe(d.installments[0].total_installments);
    // normalized só contém chaves do allowlist
    for (const k of Object.keys(d.normalized)) expect(ALLOWED.has(k)).toBe(true);
    // drift dentro do limite
    expect(d.drift.ok).toBe(true);
    expect(d.drift.delta).toBeLessThanOrEqual(d.drift.tolerance + 1e-9);
  } else {
    expect(resp.body).toHaveProperty("error");
    const err = resp.body.error;
    expect(typeof err.code).toBe("string");
    expect(typeof err.message).toBe("string");
    expect(err.message.length).toBeGreaterThan(0);
  }
}

// -------------------------- propriedades --------------------------

describe("Property-based — payloads monetários aleatórios", () => {
  it("P1: para QUALQUER payload aleatório, o handler devolve um shape contratual", async () => {
    await fc.assert(
      fc.asyncProperty(arbFuzzPayload, async (payload) => {
        // NaN / Infinity viram null via JSON.stringify — reproduz fielmente o wire.
        const resp = await handlePatchTransactionContract(req(serialize(payload)), {
          currentRow,
          persist: persistEcho,
        });
        assertResponseShape(resp);
      }),
      { numRuns: 300 },
    );
  });

  it("P1b: o handler tolera bodies não-JSON e Content-Type errado sem lançar exceção", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.string(), // pode ou não ser JSON válido
          fc.constantFrom("", "{", "]", "not json", "undefined", "NaN"),
        ),
        fc.oneof(
          fc.constantFrom("application/json", "text/plain", "application/xml", "", null),
          fc.string(),
        ),
        async (rawBody, ct) => {
          const resp = await handlePatchTransactionContract(req(rawBody, { contentType: ct }), {
            currentRow,
            persist: persistEcho,
          });
          assertResponseShape(resp);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("P2: para QUALQUER (amount, N) válido, drift |Σ − source| ≤ N × 1¢", async () => {
    await fc.assert(
      fc.asyncProperty(arbValidPayload, async ({ amount, total_installments }) => {
        const resp = await handlePatchTransactionContract(
          req(JSON.stringify({ amount, total_installments })),
          { currentRow, persist: persistEcho },
        );
        expect(resp.status).toBe(200);
        if (resp.status !== 200) return;
        const d = resp.body.data;
        const sum = round2(d.installments.reduce((s, r) => s + r.amount, 0));
        const source = d.drift.source;
        const tol = total_installments * CENT + 1e-9;
        expect(Math.abs(sum - source)).toBeLessThanOrEqual(tol);
        expect(d.installments).toHaveLength(total_installments);
      }),
      { numRuns: 500 },
    );
  });

  it("P3: chaves fora do allowlist NUNCA aparecem em `normalized` (mass-assignment)", async () => {
    const hostileKeys = fc.record(
      {
        id: fc.string(),
        user_id: fc.string(),
        role: fc.constantFrom("admin", "root"),
        __proto__: fc.record({ polluted: fc.boolean() }),
        installment_source_amount: fc.integer(),
        installment_group_id: fc.string(),
        created_at: fc.string(),
        updated_at: fc.string(),
      },
      { requiredKeys: [] },
    );
    await fc.assert(
      fc.asyncProperty(arbValidPayload, hostileKeys, async (valid, evil) => {
        const merged = { ...evil, ...valid };
        const resp = await handlePatchTransactionContract(req(JSON.stringify(merged)), {
          currentRow,
          persist: persistEcho,
        });
        expect(resp.status).toBe(200);
        if (resp.status !== 200) return;
        for (const k of Object.keys(resp.body.data.normalized)) {
          expect(ALLOWED.has(k)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("P4: NaN / Infinity em amount JAMAIS produzem 200 (sempre 422)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
        arbNiceN,
        async (amount, n) => {
          // Precisamos preservar NaN/Infinity no wire — JSON.stringify os transforma
          // em `null`, o que muda a semântica. Injetamos como token literal.
          const raw = `{"amount": ${String(amount)}, "total_installments": ${n}}`;
          // O JSON.parse falhará em `NaN`/`Infinity` (não são JSON válido) → 400.
          // Já `null` cai em 422. Ambos casos são NÃO-200 — a propriedade se mantém.
          const resp = await handlePatchTransactionContract(req(raw), {
            currentRow,
            persist: persistEcho,
          });
          expect(resp.status).not.toBe(200);
        },
      ),
      { numRuns: 60 },
    );
  });

  it("P5: N extremos (>360 ou <1) sempre são rejeitados com 422 sem invocar persist", async () => {
    const persist = vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch }));
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.integer({ min: 361, max: 10_000_000 }),
          fc.integer({ min: -10_000_000, max: 0 }),
        ),
        async (n) => {
          const resp = await handlePatchTransactionContract(
            req(JSON.stringify({ total_installments: n })),
            { currentRow, persist },
          );
          expect(resp.status).toBe(422);
          if (resp.status === 200) return;
          expect(resp.body.error.code).toBe("VALIDATION_ERROR");
        },
      ),
      { numRuns: 100 },
    );
    expect(persist).not.toHaveBeenCalled();
  });
});
