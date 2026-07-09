/**
 * Integração — UPDATE PARCIAL (PATCH) + SANITIZAÇÃO + DRIFT
 *
 * Cenário: o cliente envia um "update parcial" — apenas 1 ou 2 chaves do
 * allowlist são atualizadas, o resto permanece intocado. O teste garante:
 *
 *   1. Somente as chaves fornecidas e permitidas aparecem no payload
 *      persistido (patch — sem sobrescrever campos que o usuário não tocou).
 *   2. Qualquer chave fora do allowlist enviada junto é silenciosamente
 *      descartada (mass-assignment defense).
 *   3. As parcelas do grupo, regeneradas a partir do estado pós-patch, mantêm
 *      `|sum(amount) − source| ≤ N × 1¢` e `validateGroupCoherence` ok.
 */
import React, { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import {
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

type Full = InstallmentEditSnapshot;
type Patch = Partial<Full> & Record<string, unknown>;

const originalTx: Full = {
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

/** Sanitiza um PATCH: mantém apenas chaves permitidas + valida cada valor.
 *  Retorna somente os campos alterados (não força volta ao original). */
function sanitizePatch(patch: Patch): {
  clean: Partial<Full>;
  droppedKeys: string[];
} {
  const allowed = new Set<string>(ALLOWED_PAYLOAD_KEYS);
  const droppedKeys: string[] = [];
  const clean: Partial<Full> = {};
  for (const k of Object.keys(patch)) {
    if (!allowed.has(k)) {
      droppedKeys.push(k);
      continue;
    }
    const key = k as AllowedKey;
    const raw = (patch as Record<string, unknown>)[k];
    switch (key) {
      case "name":
        if (typeof raw === "string" && raw.trim().length > 0) clean.name = raw.trim().slice(0, 200);
        break;
      case "amount":
        if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) clean.amount = round2(raw);
        break;
      case "total_installments":
        if (typeof raw === "number" && Number.isFinite(raw) && Math.floor(raw) >= 1 && Math.floor(raw) <= 360)
          clean.total_installments = Math.floor(raw);
        break;
      case "date":
        if (typeof raw === "string" && raw.trim().length > 0) clean.date = raw.trim().slice(0, 32);
        break;
      case "category":
        if (typeof raw === "string") clean.category = raw.slice(0, 120);
        else if (raw === null) clean.category = null;
        break;
      case "icon":
        if (typeof raw === "string") clean.icon = raw.slice(0, 16);
        else if (raw === null) clean.icon = null;
        break;
      case "card":
        if (typeof raw === "string") clean.card = raw.slice(0, 80);
        else if (raw === null) clean.card = null;
        break;
      case "bank_account_id":
        if (typeof raw === "string") clean.bank_account_id = raw.slice(0, 80);
        else if (raw === null) clean.bank_account_id = null;
        break;
    }
  }
  return { clean, droppedKeys };
}

function mergePatch(original: Full, patch: Partial<Full>): Full {
  return { ...original, ...patch };
}

function regenerateGroup(state: Full, source: number): InstallmentGroupRow[] {
  const n = state.total_installments as number;
  const { valorParcela } = calculateInstallmentDetails(source, n, "divide");
  return Array.from({ length: n }, (_, i) => ({
    installment_group_id: "grp-integration",
    installment_number: i + 1,
    total_installments: n,
    amount: valorParcela,
    installment_source_amount: round2(source),
    installment_mode: "divide",
    category: state.category ?? null,
    icon: state.icon ?? null,
    card: state.card ?? null,
    bank_account_id: state.bank_account_id ?? null,
  }));
}

type PersistResult = {
  patch: Partial<Full>;           // payload realmente enviado ao banco (PATCH)
  droppedKeys: string[];
  mergedState: Full;              // estado final da linha após aplicar o patch
  rows: InstallmentGroupRow[];
  source: number;
};

function PatchHarness({ patch, onPersist }: { patch: Patch; onPersist: (r: PersistResult) => void }) {
  const [saved, setSaved] = useState(false);
  const save = () => {
    const { clean, droppedKeys } = sanitizePatch(patch);
    const merged = mergePatch(originalTx, clean);
    // Se `amount` mudou, source deriva da nova parcela × N (do estado final).
    const source =
      clean.amount !== undefined && clean.amount !== originalTx.amount
        ? round2((merged.amount as number) * (merged.total_installments as number))
        : ORIGINAL_SOURCE;
    onPersist({ patch: clean, droppedKeys, mergedState: merged, rows: regenerateGroup(merged, source), source });
    setSaved(true);
  };
  return (
    <div>
      <button onClick={save}>Aplicar patch</button>
      {saved && <span>ok</span>}
    </div>
  );
}

function runPatch(patch: Patch): PersistResult {
  let result: PersistResult | null = null;
  const { getByText } = render(<PatchHarness patch={patch} onPersist={(r) => { result = r; }} />);
  fireEvent.click(getByText("Aplicar patch"));
  return result!;
}

function assertPatchOnlyAllowedKeys(p: Partial<Full>) {
  const allowed = new Set<string>(ALLOWED_PAYLOAD_KEYS);
  for (const k of Object.keys(p)) {
    expect(allowed.has(k), `chave não permitida no patch: ${k}`).toBe(true);
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

describe("Integração — PATCH parcial mantém apenas chaves saneadas e drift ≤ N¢", () => {
  it("patch cosmético mínimo (só categoria): patch tem 1 chave, campos estruturais intactos", () => {
    const r = runPatch({ category: "Alimentação" });
    assertPatchOnlyAllowedKeys(r.patch);
    expect(Object.keys(r.patch)).toEqual(["category"]);
    expect(r.patch.category).toBe("Alimentação");
    // Nada estrutural foi tocado: source e rows preservam o grupo original.
    expect(r.source).toBe(ORIGINAL_SOURCE);
    expect(r.mergedState.name).toBe(originalTx.name);
    expect(r.mergedState.amount).toBe(originalTx.amount);
    expect(r.mergedState.total_installments).toBe(originalTx.total_installments);
    assertRowsInvariant(r.rows);
    for (const row of r.rows) expect(row.category).toBe("Alimentação");
  });

  it("patch cosmético + chaves não permitidas: lixo é descartado, patch mantém só o cosmético", () => {
    const r = runPatch({
      icon: "🍔",
      id: "atacante",
      user_id: "outro",
      installment_group_id: "outro-grupo",
      created_at: "1970-01-01",
    });
    assertPatchOnlyAllowedKeys(r.patch);
    expect(Object.keys(r.patch)).toEqual(["icon"]);
    expect(r.droppedKeys.sort()).toEqual(
      ["created_at", "id", "installment_group_id", "user_id"].sort(),
    );
    expect(r.source).toBe(ORIGINAL_SOURCE);
    assertRowsInvariant(r.rows);
    for (const row of r.rows) expect(row.icon).toBe("🍔");
  });

  it("patch estrutural mínimo (só amount) → source recalcula com N original, drift preservado", () => {
    const r = runPatch({ amount: 200 });
    assertPatchOnlyAllowedKeys(r.patch);
    expect(Object.keys(r.patch)).toEqual(["amount"]);
    expect(r.patch.amount).toBe(200);
    // N não foi enviado → merged mantém 12; nova source = 200 × 12 = 2400
    expect(r.mergedState.total_installments).toBe(12);
    expect(r.source).toBe(2400);
    assertRowsInvariant(r.rows);
  });

  it("patch estrutural (só total_installments) → N muda, source permanece igual ao original", () => {
    const r = runPatch({ total_installments: 5 });
    assertPatchOnlyAllowedKeys(r.patch);
    expect(Object.keys(r.patch)).toEqual(["total_installments"]);
    expect(r.mergedState.total_installments).toBe(5);
    // amount não mudou → source permanece o econômico anterior (1000),
    // parcelas regeneram 1000/5 = 200,00 exatas.
    expect(r.source).toBe(ORIGINAL_SOURCE);
    assertRowsInvariant(r.rows);
    for (const row of r.rows) expect(row.amount).toBe(200);
  });

  it("patch com valores inválidos junto: chaves inválidas somem do patch, válidas persistem", () => {
    const r = runPatch({
      name: "  ",                    // inválido → NÃO entra no patch
      amount: -10,                   // inválido → NÃO entra no patch
      total_installments: 0,         // inválido → NÃO entra no patch
      date: "",                      // inválido → NÃO entra no patch
      category: "Casa Atualizada",   // válido
      icon: "🏡",                    // válido
      is_admin: true,                // fora do allowlist
    });
    assertPatchOnlyAllowedKeys(r.patch);
    expect(Object.keys(r.patch).sort()).toEqual(["category", "icon"].sort());
    expect(r.droppedKeys).toContain("is_admin");
    // Estado final: campos inválidos ficam com o valor original
    expect(r.mergedState.name).toBe(originalTx.name);
    expect(r.mergedState.amount).toBe(originalTx.amount);
    expect(r.mergedState.total_installments).toBe(originalTx.total_installments);
    expect(r.mergedState.date).toBe(originalTx.date);
    expect(r.mergedState.category).toBe("Casa Atualizada");
    expect(r.source).toBe(ORIGINAL_SOURCE);
    assertRowsInvariant(r.rows);
  });

  it("patch estrutural composto (amount + N) com dízima: 100/3 → drift natural ≤ 3¢", () => {
    const r = runPatch({
      amount: round2(100 / 3),        // 33,33
      total_installments: 3,
      // ruído:
      id: "x",
      installment_source_amount: 9_999_999,
    });
    assertPatchOnlyAllowedKeys(r.patch);
    expect(Object.keys(r.patch).sort()).toEqual(["amount", "total_installments"].sort());
    expect(r.droppedKeys).toEqual(expect.arrayContaining(["id", "installment_source_amount"]));
    expect(r.mergedState.amount).toBe(33.33);
    expect(r.mergedState.total_installments).toBe(3);
    // source = 33,33 × 3 = 99,99 (dízima)
    expect(r.source).toBe(99.99);
    const sum = r.rows.reduce((s, x) => s + x.amount, 0);
    expect(Math.abs(sum - r.source)).toBeLessThanOrEqual(3 * CENT + 1e-9);
    assertRowsInvariant(r.rows);
  });

  it("patch vazio (nenhuma chave permitida) → patch = {}, estado e drift preservados", () => {
    const r = runPatch({ id: "x", user_id: "y", role: "admin", foo: 1 });
    assertPatchOnlyAllowedKeys(r.patch);
    expect(Object.keys(r.patch)).toEqual([]);
    expect(r.droppedKeys.sort()).toEqual(["foo", "id", "role", "user_id"].sort());
    expect(r.mergedState).toEqual(originalTx);
    expect(r.source).toBe(ORIGINAL_SOURCE);
    assertRowsInvariant(r.rows);
  });

  it("patch com bank_account_id=null explícito é preservado (null válido, não é 'ausente')", () => {
    const stateWithAccount: Full = { ...originalTx, bank_account_id: "acc-1" };
    // Reusamos a lógica com um "original" diferente: sanitizePatch já aceita null.
    const { clean, droppedKeys } = sanitizePatch({ bank_account_id: null, id: "x" });
    expect(droppedKeys).toEqual(["id"]);
    expect(Object.keys(clean)).toEqual(["bank_account_id"]);
    expect(clean.bank_account_id).toBeNull();
    const merged = mergePatch(stateWithAccount, clean);
    expect(merged.bank_account_id).toBeNull();
    const rows = regenerateGroup(merged, ORIGINAL_SOURCE);
    assertRowsInvariant(rows);
    for (const row of rows) expect(row.bank_account_id).toBeNull();
  });
});
