/**
 * Integração — Asserts de esquema (Zod) sobre o payload persistido.
 *
 * Garante que, após saneamento, o payload SEMPRE satisfaz um schema estrito
 * (tipos exatos: string/number, nullables explícitos, ranges) e que as
 * parcelas geradas a partir desse payload também satisfazem o schema de
 * linha do grupo — mantendo drift `|Σ − source| ≤ N¢`.
 *
 * Entradas hostis (tipos errados, coerção parcial, arrays, objetos, `NaN`,
 * `Infinity`) NÃO podem quebrar o cálculo nem produzir payload que falhe
 * o schema.
 */
import React, { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { z } from "zod";
import {
  validateGroupCoherence,
  type InstallmentEditSnapshot,
  type InstallmentGroupRow,
} from "@/lib/installment-edit";
import { calculateInstallmentDetails } from "@/lib/installment-utils";

const CENT = 0.01;
const round2 = (n: number) => Math.round(n * 100) / 100;

// -------- Schemas ---------------------------------------------------------

const PersistedPayloadSchema = z
  .object({
    name: z.string().min(1).max(200),
    amount: z.number().positive().finite(),
    total_installments: z.number().int().min(1).max(360),
    date: z.string().min(1).max(32),
    category: z.string().max(120).nullable(),
    icon: z.string().max(16).nullable(),
    card: z.string().max(80).nullable(),
    bank_account_id: z.string().max(80).nullable(),
  })
  .strict(); // ⇐ NENHUMA chave extra tolerada

const InstallmentRowSchema = z
  .object({
    installment_group_id: z.string().min(1),
    installment_number: z.number().int().min(1),
    total_installments: z.number().int().min(1),
    amount: z
      .number()
      .positive()
      .finite()
      .refine((n) => Math.round(n * 100) === n * 100, "amount must have ≤ 2 decimals"),
    installment_source_amount: z.number().positive().finite(),
    installment_mode: z.enum(["divide", "fixed"]),
    category: z.string().nullable(),
    icon: z.string().nullable(),
    card: z.string().nullable(),
    bank_account_id: z.string().nullable(),
  })
  .strict();

type PersistedPayload = z.infer<typeof PersistedPayloadSchema>;
type PayloadInput = Partial<Record<string, unknown>>;

// -------- Sanitização ----------------------------------------------------

const ALLOWED_KEYS = [
  "name", "amount", "total_installments", "date",
  "category", "icon", "card", "bank_account_id",
] as const;

const DEFAULTS: PersistedPayload = {
  name: "Sem nome",
  amount: 1,           // 1¢ garante `positive`
  total_installments: 1,
  date: "01 jan",
  category: null,
  icon: null,
  card: null,
  bank_account_id: null,
};

function coerceString(raw: unknown, maxLen: number): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  return t.slice(0, maxLen);
}
function coerceNullableString(raw: unknown, maxLen: number): string | null | undefined {
  if (raw === null) return null;
  return coerceString(raw, maxLen);
}
function coerceAmount(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return undefined;
  return round2(raw);
}
function coerceInt(raw: unknown, min: number, max: number): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  const i = Math.floor(raw);
  if (i < min || i > max) return undefined;
  return i;
}

function sanitize(input: PayloadInput): PersistedPayload {
  const out: PersistedPayload = { ...DEFAULTS };
  for (const key of ALLOWED_KEYS) {
    if (!(key in input)) continue;
    const raw = input[key];
    switch (key) {
      case "name": {
        const v = coerceString(raw, 200);
        if (v !== undefined) out.name = v;
        break;
      }
      case "amount": {
        const v = coerceAmount(raw);
        if (v !== undefined) out.amount = v;
        break;
      }
      case "total_installments": {
        const v = coerceInt(raw, 1, 360);
        if (v !== undefined) out.total_installments = v;
        break;
      }
      case "date": {
        const v = coerceString(raw, 32);
        if (v !== undefined) out.date = v;
        break;
      }
      case "category": {
        const v = coerceNullableString(raw, 120);
        if (v !== undefined) out.category = v;
        break;
      }
      case "icon": {
        const v = coerceNullableString(raw, 16);
        if (v !== undefined) out.icon = v;
        break;
      }
      case "card": {
        const v = coerceNullableString(raw, 80);
        if (v !== undefined) out.card = v;
        break;
      }
      case "bank_account_id": {
        const v = coerceNullableString(raw, 80);
        if (v !== undefined) out.bank_account_id = v;
        break;
      }
    }
  }
  return out;
}

function regenerate(p: PersistedPayload): InstallmentGroupRow[] {
  const source = round2(p.amount * p.total_installments);
  const { valorParcela } = calculateInstallmentDetails(source, p.total_installments, "divide");
  return Array.from({ length: p.total_installments }, (_, i) => ({
    installment_group_id: "grp-schema",
    installment_number: i + 1,
    total_installments: p.total_installments,
    amount: valorParcela,
    installment_source_amount: source,
    installment_mode: "divide",
    category: p.category,
    icon: p.icon,
    card: p.card,
    bank_account_id: p.bank_account_id,
  }));
}

// -------- Harness --------------------------------------------------------

type PersistResult = { payload: PersistedPayload; rows: InstallmentGroupRow[] };

function Harness({ input, onPersist }: { input: PayloadInput; onPersist: (r: PersistResult) => void }) {
  const [done, setDone] = useState(false);
  const save = () => {
    const payload = sanitize(input);
    const rows = regenerate(payload);
    onPersist({ payload, rows });
    setDone(true);
  };
  return (
    <div>
      <button onClick={save}>Persistir</button>
      {done && <span>ok</span>}
    </div>
  );
}

function run(input: PayloadInput): PersistResult {
  let result: PersistResult | null = null;
  const { getByText } = render(<Harness input={input} onPersist={(r) => { result = r; }} />);
  fireEvent.click(getByText("Persistir"));
  return result!;
}

// -------- Asserts reutilizáveis ------------------------------------------

function assertSchema(r: PersistResult) {
  const p = PersistedPayloadSchema.safeParse(r.payload);
  expect(p.success, p.success ? "" : JSON.stringify(p.error.issues)).toBe(true);
  for (const row of r.rows) {
    const parsed = InstallmentRowSchema.safeParse(row);
    expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues)).toBe(true);
  }
}

function assertDrift(r: PersistResult) {
  const n = r.payload.total_installments;
  const src = r.rows[0].installment_source_amount;
  const sum = r.rows.reduce((s, x) => s + x.amount, 0);
  expect(Math.abs(sum - src)).toBeLessThanOrEqual(n * CENT + 1e-9);
  expect(validateGroupCoherence(r.rows).ok).toBe(true);
}

function assertNoExtraKeys(payload: PersistedPayload) {
  expect(Object.keys(payload).sort()).toEqual([...ALLOWED_KEYS].sort());
}

// -------- Testes ---------------------------------------------------------

describe("Integração — Asserts de schema sobre payload persistido", () => {
  it("payload feliz: todos os tipos corretos → schema ok + drift ok", () => {
    const r = run({
      name: "Compra",
      amount: 1500,
      total_installments: 12,
      date: "10 mar",
      category: "Casa",
      icon: "🏠",
      card: "Nubank",
      bank_account_id: null,
    });
    assertSchema(r);
    assertDrift(r);
    assertNoExtraKeys(r.payload);
  });

  it("tipos errados (string em amount, number em name) caem em defaults e passam no schema", () => {
    const r = run({
      name: 12345 as unknown as string,     // tipo inválido → default "Sem nome"
      amount: "1500" as unknown as number,  // tipo inválido → default 1
      total_installments: "12" as unknown as number,
      date: null as unknown as string,
      category: 42 as unknown as string,
      icon: {} as unknown as string,
      card: [] as unknown as string,
      bank_account_id: undefined,
    });
    assertSchema(r);
    expect(r.payload.name).toBe("Sem nome");
    expect(r.payload.amount).toBe(1);
    expect(r.payload.total_installments).toBe(1);
    expect(r.payload.date).toBe("01 jan");
    expect(r.payload.category).toBeNull();
    expect(r.payload.icon).toBeNull();
    expect(r.payload.card).toBeNull();
    expect(r.payload.bank_account_id).toBeNull();
    assertDrift(r);
  });

  it("nullables aceitos SÓ como null explícito, nunca 'null' string", () => {
    const r = run({
      name: "X", amount: 10, total_installments: 2, date: "01",
      category: null, icon: null, card: null, bank_account_id: null,
    });
    assertSchema(r);
    for (const k of ["category", "icon", "card", "bank_account_id"] as const) {
      expect(r.payload[k]).toBeNull();
    }
    // 'null' string NÃO vira null: é uma string qualquer válida.
    const r2 = run({ name: "X", amount: 10, total_installments: 2, date: "01", category: "null" });
    assertSchema(r2);
    expect(r2.payload.category).toBe("null");
  });

  it("valores patológicos numéricos (NaN, Infinity, -0, negativos) NÃO quebram o cálculo", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0, -1, 0]) {
      const r = run({ name: "X", amount: bad, total_installments: 12, date: "01" });
      assertSchema(r);
      expect(r.payload.amount).toBe(1); // default seguro
      assertDrift(r);
    }
  });

  it("N patológicos (NaN, 0, negativo, > 360, fracionário) caem em default N=1", () => {
    for (const bad of [Number.NaN, 0, -3, 999, 12.7 as number]) {
      const r = run({ name: "X", amount: 100, total_installments: bad, date: "01" });
      assertSchema(r);
      // 12.7 → floor(12.7)=12, dentro do range → aceito. Os demais caem em N=1.
      if (bad === 12.7) expect(r.payload.total_installments).toBe(12);
      else expect(r.payload.total_installments).toBe(1);
      assertDrift(r);
    }
  });

  it("chaves fora do allowlist são descartadas: schema .strict() NUNCA falha por chave extra", () => {
    const r = run({
      name: "X", amount: 10, total_installments: 2, date: "01",
      // ruído:
      id: "atacante", user_id: "u1", is_admin: true, __proto__: { x: 1 },
      installment_source_amount: 9_999_999,
    });
    assertSchema(r);
    assertNoExtraKeys(r.payload);
  });

  it("string maiúscula ultralonga é truncada dentro do limite do schema", () => {
    const longName = "A".repeat(500);
    const longCat = "B".repeat(500);
    const r = run({
      name: longName, amount: 10, total_installments: 2, date: "01",
      category: longCat, icon: "🏠".repeat(20), card: "C".repeat(200),
      bank_account_id: "D".repeat(200),
    });
    assertSchema(r);
    expect(r.payload.name.length).toBeLessThanOrEqual(200);
    expect((r.payload.category ?? "").length).toBeLessThanOrEqual(120);
    expect((r.payload.icon ?? "").length).toBeLessThanOrEqual(16);
    expect((r.payload.card ?? "").length).toBeLessThanOrEqual(80);
    expect((r.payload.bank_account_id ?? "").length).toBeLessThanOrEqual(80);
    assertDrift(r);
  });

  it("dízima (100/3) e sub-cent (155.554) → schema exige ≤ 2 casas em row.amount", () => {
    for (const amount of [100 / 3, 155.554, 33.335, 0.005]) {
      const r = run({ name: "X", amount, total_installments: 3, date: "01" });
      assertSchema(r); // .refine garante que amount tem ≤ 2 casas
      for (const row of r.rows) {
        // round-trip: amount * 100 é inteiro
        expect(Math.round(row.amount * 100)).toBe(row.amount * 100);
      }
      assertDrift(r);
    }
  });

  it("entradas hostis (arrays, objetos, funções, symbols) em campos string caem em defaults/null", () => {
    const r = run({
      name: (() => "x") as unknown as string,
      amount: 10,
      total_installments: 3,
      date: ["01"] as unknown as string,
      category: { toString: () => "cat" } as unknown as string,
      icon: Symbol("x") as unknown as string,
      card: new Date() as unknown as string,
      bank_account_id: /re/ as unknown as string,
    });
    assertSchema(r);
    expect(r.payload.name).toBe("Sem nome");
    expect(r.payload.date).toBe("01 jan");
    expect(r.payload.category).toBeNull();
    expect(r.payload.icon).toBeNull();
    expect(r.payload.card).toBeNull();
    expect(r.payload.bank_account_id).toBeNull();
    assertDrift(r);
  });

  it("stress paramétrico: 30 amounts × 5 N — schema válido e drift ≤ N¢ para todos", () => {
    const amounts = [
      0.01, 0.03, 0.05, 0.1, 0.33, 1, 1.005, 3.14, 7.77, 9.99,
      10, 12.5, 33.33, 50, 99.99, 100, 100 / 3, 100 / 7, 155.554, 250,
      1000, 1000 / 12, 1234.56, 2000, 3333.33, 5000, 9999.99, 12345.67, 55555.55, 99999.99,
    ];
    const Ns = [1, 3, 7, 12, 24];
    for (const amount of amounts) {
      for (const n of Ns) {
        const r = run({ name: "T", amount, total_installments: n, date: "01" });
        assertSchema(r);
        assertDrift(r);
      }
    }
  });
});
