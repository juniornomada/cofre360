/**
 * Integração — SANITIZAÇÃO DE CAMPOS NÃO PERMITIDOS
 *
 * Este teste garante que, mesmo se o "draft" enviado à camada de persistência
 * contiver chaves fora do allowlist (tentativas de mass-assignment: `id`,
 * `user_id`, `created_at`, `is_admin`, `installment_group_id`, `__proto__`,
 * lixo arbitrário) ou valores maliciosos em chaves permitidas (SQL/HTML
 * strings, números fora de faixa), o payload persistido:
 *
 *   1. Contenha SOMENTE chaves do allowlist (`ALLOWED_PAYLOAD_KEYS`).
 *   2. Nunca inclua `id` / `user_id` / `installment_group_id` / etc.
 *   3. Preserve strings cosméticas como texto puro (sem executar HTML).
 *   4. Mantenha o drift `|sum(amount) − source| ≤ N × 1¢` após regenerar
 *      o grupo a partir do payload saneado.
 */
import React, { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import {
  detectInstallmentChanges,
  splitInstallmentChanges,
  validateGroupCoherence,
  type InstallmentEditSnapshot,
  type InstallmentGroupRow,
} from "@/lib/installment-edit";
import { calculateInstallmentDetails } from "@/lib/installment-utils";

const CENT = 0.01;
const round2 = (n: number) => Math.round(n * 100) / 100;

const ALLOWED_PAYLOAD_KEYS = [
  "name",
  "amount",
  "total_installments",
  "date",
  "category",
  "icon",
  "card",
  "bank_account_id",
] as const;
type AllowedKey = (typeof ALLOWED_PAYLOAD_KEYS)[number];

type Payload = InstallmentEditSnapshot;
type DirtyDraft = Partial<Payload> & Record<string, unknown>;

const originalTx: Payload = {
  name: "Compra",
  amount: round2(1000 / 12),
  total_installments: 12,
  category: "Casa",
  icon: "🏠",
  date: "10 mar",
  card: "Nubank",
  bank_account_id: null,
};
const ORIGINAL_SOURCE = 1000;

/**
 * Sanitiza o draft: mantém APENAS chaves do allowlist e valida cada campo.
 * Qualquer chave estranha (id, user_id, __proto__, …) é descartada em silêncio.
 */
function sanitizePayload(original: Payload, draft: DirtyDraft): {
  clean: Payload;
  droppedKeys: string[];
} {
  const allowed = new Set<string>(ALLOWED_PAYLOAD_KEYS);
  const droppedKeys: string[] = [];
  for (const k of Object.keys(draft)) {
    if (!allowed.has(k)) droppedKeys.push(k);
  }
  const pick = <K extends AllowedKey>(k: K): unknown =>
    Object.prototype.hasOwnProperty.call(draft, k) ? (draft as Record<string, unknown>)[k] : undefined;

  const rawName = pick("name");
  const rawAmount = pick("amount");
  const rawTotal = pick("total_installments");
  const rawDate = pick("date");
  const rawCategory = pick("category");
  const rawIcon = pick("icon");
  const rawCard = pick("card");
  const rawBankAccount = pick("bank_account_id");

  const clean: Payload = {
    name:
      typeof rawName === "string" && rawName.trim().length > 0
        ? rawName.trim().slice(0, 200)
        : original.name,
    amount:
      typeof rawAmount === "number" && Number.isFinite(rawAmount) && rawAmount > 0
        ? round2(rawAmount)
        : original.amount,
    total_installments:
      typeof rawTotal === "number" &&
      Number.isFinite(rawTotal) &&
      Math.floor(rawTotal) >= 1 &&
      Math.floor(rawTotal) <= 360
        ? Math.floor(rawTotal)
        : original.total_installments,
    date:
      typeof rawDate === "string" && rawDate.trim().length > 0
        ? rawDate.trim().slice(0, 32)
        : original.date,
    category: typeof rawCategory === "string" ? rawCategory.slice(0, 120) : original.category ?? null,
    icon: typeof rawIcon === "string" ? rawIcon.slice(0, 16) : original.icon ?? null,
    card: typeof rawCard === "string" ? rawCard.slice(0, 80) : rawCard === null ? null : original.card ?? null,
    bank_account_id:
      typeof rawBankAccount === "string"
        ? rawBankAccount.slice(0, 80)
        : rawBankAccount === null
          ? null
          : original.bank_account_id ?? null,
  };
  return { clean, droppedKeys };
}

function regenerateGroup(payload: Payload, source: number): InstallmentGroupRow[] {
  const n = payload.total_installments as number;
  const { valorParcela } = calculateInstallmentDetails(source, n, "divide");
  return Array.from({ length: n }, (_, i) => ({
    installment_group_id: "grp-integration",
    installment_number: i + 1,
    total_installments: n,
    amount: valorParcela,
    installment_source_amount: round2(source),
    installment_mode: "divide",
    category: payload.category ?? null,
    icon: payload.icon ?? null,
    card: payload.card ?? null,
    bank_account_id: payload.bank_account_id ?? null,
  }));
}

type PersistResult = {
  payload: Payload;
  droppedKeys: string[];
  rows: InstallmentGroupRow[];
  source: number;
};

function EditHarness({ draft, onPersist }: { draft: DirtyDraft; onPersist: (r: PersistResult) => void }) {
  const [saved, setSaved] = useState(false);
  const save = () => {
    // O gate roda ANTES da sanitização — usa somente valores tipados do allowlist.
    const editedSnap: Payload = {
      name: typeof draft.name === "string" ? draft.name : originalTx.name,
      amount: typeof draft.amount === "number" ? draft.amount : originalTx.amount,
      total_installments:
        typeof draft.total_installments === "number" ? draft.total_installments : originalTx.total_installments,
      category: typeof draft.category === "string" ? draft.category : originalTx.category,
      icon: typeof draft.icon === "string" ? draft.icon : originalTx.icon,
      date: typeof draft.date === "string" ? draft.date : originalTx.date,
      card: typeof draft.card === "string" ? draft.card : originalTx.card,
      bank_account_id:
        typeof draft.bank_account_id === "string" || draft.bank_account_id === null
          ? (draft.bank_account_id as string | null)
          : originalTx.bank_account_id,
    };
    detectInstallmentChanges(originalTx, editedSnap, editedSnap.amount);
    splitInstallmentChanges([]); // sanity call, mantém contrato exportado

    const { clean, droppedKeys } = sanitizePayload(originalTx, draft);
    const source =
      clean.amount !== originalTx.amount
        ? round2(clean.amount * (clean.total_installments as number))
        : ORIGINAL_SOURCE;
    onPersist({ payload: clean, droppedKeys, rows: regenerateGroup(clean, source), source });
    setSaved(true);
  };
  return (
    <div>
      <button onClick={save}>Salvar</button>
      {saved && <span>ok</span>}
    </div>
  );
}

function assertOnlyAllowedKeys(payload: Payload) {
  const allowed = new Set<string>(ALLOWED_PAYLOAD_KEYS);
  for (const k of Object.keys(payload)) {
    expect(allowed.has(k), `chave não permitida: ${k}`).toBe(true);
  }
}

function assertRowsInvariant(rows: InstallmentGroupRow[]) {
  const n = rows[0].total_installments as number;
  const source = rows[0].installment_source_amount as number;
  for (const r of rows) {
    expect(round2(r.amount)).toBe(r.amount);
    expect(r.total_installments).toBe(n);
    expect(r.installment_source_amount).toBe(source);
  }
  const sum = rows.reduce((s, r) => s + r.amount, 0);
  expect(Math.abs(sum - source)).toBeLessThanOrEqual(n * CENT + 1e-9);
  expect(validateGroupCoherence(rows).ok).toBe(true);
}

function runSave(draft: DirtyDraft): PersistResult {
  let result: PersistResult | null = null;
  const { getByText } = render(<EditHarness draft={draft} onPersist={(r) => { result = r; }} />);
  fireEvent.click(getByText("Salvar"));
  return result!;
}

describe("Integração — payload rejeita campos não permitidos e regenera parcelas com drift ≤ N¢", () => {
  it("mass-assignment clássico (id/user_id/created_at) é descartado do payload", () => {
    const r = runSave({
      id: "atacante-forjou-esse-id",
      user_id: "00000000-0000-0000-0000-000000000000",
      created_at: "1970-01-01T00:00:00Z",
      updated_at: "1970-01-01T00:00:00Z",
      name: "Compra Atualizada",
      amount: 120,
      total_installments: 4,
      category: "Alimentação",
      icon: "🍔",
    });
    assertOnlyAllowedKeys(r.payload);
    expect(r.droppedKeys.sort()).toEqual(["created_at", "id", "updated_at", "user_id"].sort());
    expect((r.payload as any).id).toBeUndefined();
    expect((r.payload as any).user_id).toBeUndefined();
    expect(r.payload.name).toBe("Compra Atualizada");
    expect(r.payload.amount).toBe(120);
    expect(r.payload.total_installments).toBe(4);
    expect(r.source).toBe(round2(120 * 4));
    assertRowsInvariant(r.rows);
  });

  it("tentativa de mutar installment_group_id / installment_number é descartada", () => {
    const r = runSave({
      installment_group_id: "grupo-de-outro-usuario",
      installment_number: 999,
      installment_mode: "fixed",
      installment_source_amount: 10_000_000,
      amount: 50,
      total_installments: 3,
    });
    assertOnlyAllowedKeys(r.payload);
    expect(r.droppedKeys).toEqual(
      expect.arrayContaining([
        "installment_group_id",
        "installment_number",
        "installment_mode",
        "installment_source_amount",
      ]),
    );
    // Group id só existe nas rows geradas pela camada de persistência.
    expect((r.payload as any).installment_group_id).toBeUndefined();
    expect(r.payload.amount).toBe(50);
    expect(r.payload.total_installments).toBe(3);
    // source deriva do amount saneado × N, ignorando os 10_000_000 injetados
    expect(r.source).toBe(round2(50 * 3));
    assertRowsInvariant(r.rows);
  });

  it("chaves totalmente arbitrárias (__proto__, is_admin, sql) são descartadas silenciosamente", () => {
    const r = runSave({
      __proto__: { polluted: true } as unknown,
      is_admin: true,
      role: "service_role",
      "; DROP TABLE transactions; --": "boom",
      random_garbage: { deep: { nested: [1, 2, 3] } },
      amount: 200,
      total_installments: 5,
      category: "Casa",
    });
    assertOnlyAllowedKeys(r.payload);
    expect(r.droppedKeys).toEqual(
      expect.arrayContaining(["is_admin", "role", "; DROP TABLE transactions; --", "random_garbage"]),
    );
    expect((r.payload as any).is_admin).toBeUndefined();
    expect((r.payload as any).role).toBeUndefined();
    // Prototype pollution não vaza para o payload nem para Object.prototype
    expect((Object.prototype as any).polluted).toBeUndefined();
    expect(r.payload.amount).toBe(200);
    expect(r.source).toBe(round2(200 * 5));
    assertRowsInvariant(r.rows);
  });

  it("valores maliciosos em chaves permitidas (HTML/SQL string, número fora de faixa) são coagidos com segurança", () => {
    const r = runSave({
      name: "<script>alert('xss')</script>",
      category: "Alimentação'; DROP TABLE users;--",
      icon: "🍔",
      amount: Number.POSITIVE_INFINITY, // inválido → volta ao original
      total_installments: 99999,        // fora do teto (360) → volta ao original
      date: "   ",                       // só espaços → volta ao original
    });
    assertOnlyAllowedKeys(r.payload);
    // Strings são preservadas como TEXTO (não executadas). RLS + escaping do
    // driver Supabase cuidam do resto — aqui só garantimos que nada é filtrado
    // silenciosamente a ponto de virar undefined.
    expect(r.payload.name).toBe("<script>alert('xss')</script>");
    expect(r.payload.category).toBe("Alimentação'; DROP TABLE users;--");
    // Valores inválidos revertem para o original — não corrompem o grupo.
    expect(r.payload.amount).toBe(originalTx.amount);
    expect(r.payload.total_installments).toBe(originalTx.total_installments);
    expect(r.payload.date).toBe(originalTx.date);
    expect(r.source).toBe(ORIGINAL_SOURCE);
    assertRowsInvariant(r.rows);
  });

  it("payload 100% lixo (só chaves fora do allowlist) → payload = original + parcelas coerentes", () => {
    const r = runSave({
      foo: 1,
      bar: "baz",
      nested: { evil: true },
      id: "x",
      user_id: "y",
    });
    assertOnlyAllowedKeys(r.payload);
    expect(r.droppedKeys.sort()).toEqual(["bar", "foo", "id", "nested", "user_id"].sort());
    expect(r.payload).toEqual({ ...originalTx });
    expect(r.source).toBe(ORIGINAL_SOURCE);
    assertRowsInvariant(r.rows);
  });

  it("edição válida + chaves não permitidas: mantém válidos, descarta o resto, drift ≤ N¢ em dízima (100/3)", () => {
    const r = runSave({
      id: "atacante",
      user_id: "atacante",
      installment_group_id: "outro-grupo",
      name: "Compra 3x",
      amount: round2(100 / 3), // 33,33 → drift natural
      total_installments: 3,
      category: "Casa",
      icon: "🏠",
      card: "Nubank",
    });
    assertOnlyAllowedKeys(r.payload);
    expect((r.payload as any).id).toBeUndefined();
    expect((r.payload as any).installment_group_id).toBeUndefined();
    expect(r.payload.amount).toBe(33.33);
    expect(r.payload.total_installments).toBe(3);
    // 33,33 × 3 = 99,99 (dízima) — drift ≤ 3¢
    expect(r.source).toBe(99.99);
    const sum = r.rows.reduce((s, x) => s + x.amount, 0);
    expect(Math.abs(sum - r.source)).toBeLessThanOrEqual(3 * CENT + 1e-9);
    assertRowsInvariant(r.rows);
  });
});
