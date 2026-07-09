/**
 * Integration test — SANITIZAÇÃO DO PAYLOAD + DRIFT PÓS-UPDATE
 *
 * Este teste cobre o fluxo completo:
 *
 *   1. O usuário edita uma parcela combinando campos válidos e inválidos:
 *        - Estruturais válidos (novo valor, novo N, nova data)
 *        - Estruturais inválidos (nome vazio, valor ≤ 0/NaN, N < 1, data vazia)
 *        - Cosméticos (categoria, ícone, cartão, conta bancária)
 *   2. O gate detecta as mudanças e o diálogo de escopo abre.
 *   3. Ao confirmar, a camada de persistência precisa:
 *        a) SANITIZAR o payload — descartar tudo que é inválido, guardar
 *           somente campos permitidos e válidos;
 *        b) REGENERAR as parcelas do grupo a partir do payload saneado
 *           (novo `installment_source_amount` e N efetivo);
 *   4. O grupo resultante deve manter:
 *        - amounts com no máximo 2 casas decimais
 *        - `|sum(amount) − installment_source_amount| ≤ N × 1¢`
 *        - `validateGroupCoherence` ok
 *        - propagação de cosméticos aplicada em TODAS as parcelas
 */
import React, { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

type Payload = InstallmentEditSnapshot;

const originalTx: Payload = {
  name: "Compra",
  amount: round2(1000 / 12), // 83,33
  total_installments: 12,
  category: "Casa",
  icon: "🏠",
  date: "10 mar",
  card: "Nubank",
  bank_account_id: null,
};
const ORIGINAL_SOURCE = 1000;

/** Sanitiza o draft: campos inválidos revertem para o original. */
function sanitizePayload(original: Payload, draft: Payload): Payload {
  const p: Payload = {} as Payload;
  p.name = draft.name && draft.name.trim().length > 0 ? draft.name : original.name;
  p.amount =
    typeof draft.amount === "number" && !Number.isNaN(draft.amount) && draft.amount > 0
      ? round2(draft.amount)
      : original.amount;
  p.total_installments =
    typeof draft.total_installments === "number" &&
    Number.isFinite(draft.total_installments) &&
    Math.floor(draft.total_installments) >= 1
      ? Math.floor(draft.total_installments)
      : original.total_installments;
  p.date = draft.date && String(draft.date).trim().length > 0 ? draft.date : original.date;
  p.category = draft.category ?? null;
  p.icon = draft.icon ?? null;
  p.card = draft.card ?? null;
  p.bank_account_id = draft.bank_account_id ?? null;
  return p;
}

/** Regenera as parcelas do grupo a partir do payload saneado. */
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
  scopeOpened: boolean;
  payload: Payload;
  droppedInvalidFields: string[];
  rows: InstallmentGroupRow[];
  source: number;
};

function EditHarness({ onPersist }: { onPersist: (r: PersistResult) => void }) {
  const [open, setOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [draft, setDraft] = useState<Payload>({ ...originalTx });

  const openDialog = () => {
    setDraft({ ...originalTx });
    setOpen(true);
  };

  const handleSave = () => {
    const changes = detectInstallmentChanges(originalTx, draft, draft.amount);
    const { structural } = splitInstallmentChanges(changes);
    if (structural.length > 0) {
      setScopeOpen(true);
    } else {
      const sanitized = sanitizePayload(originalTx, draft);
      onPersist({
        scopeOpened: false,
        payload: sanitized,
        droppedInvalidFields: [],
        rows: regenerateGroup(sanitized, ORIGINAL_SOURCE),
        source: ORIGINAL_SOURCE,
      });
      setOpen(false);
    }
  };

  const confirmScope = () => {
    const sanitized = sanitizePayload(originalTx, draft);
    // Fonte econômica muda apenas se o `amount` mudou (nova parcela × N).
    const source =
      sanitized.amount !== originalTx.amount
        ? round2(sanitized.amount * (sanitized.total_installments as number))
        : ORIGINAL_SOURCE;

    const dropped: string[] = [];
    if (sanitized.name === originalTx.name && draft.name !== originalTx.name) dropped.push("name");
    if (sanitized.amount === originalTx.amount && draft.amount !== originalTx.amount) dropped.push("amount");
    if (
      sanitized.total_installments === originalTx.total_installments &&
      draft.total_installments !== originalTx.total_installments
    ) dropped.push("total_installments");
    if (sanitized.date === originalTx.date && draft.date !== originalTx.date) dropped.push("date");

    onPersist({
      scopeOpened: true,
      payload: sanitized,
      droppedInvalidFields: dropped,
      rows: regenerateGroup(sanitized, source),
      source,
    });
    setScopeOpen(false);
    setOpen(false);
  };

  return (
    <div>
      <button onClick={openDialog}>Editar transação</button>
      {open && (
        <div role="dialog" aria-label="Editar transação">
          <input aria-label="nome" value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input aria-label="valor" type="number" value={draft.amount}
            onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })} />
          <input aria-label="parcelas" type="number" value={draft.total_installments ?? ""}
            onChange={(e) => setDraft({ ...draft, total_installments: Number(e.target.value) })} />
          <input aria-label="data" value={draft.date ?? ""}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          <input aria-label="categoria" value={draft.category ?? ""}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
          <input aria-label="icone" value={draft.icon ?? ""}
            onChange={(e) => setDraft({ ...draft, icon: e.target.value })} />
          <input aria-label="cartao" value={draft.card ?? ""}
            onChange={(e) => setDraft({ ...draft, card: e.target.value })} />
          <button onClick={handleSave}>Salvar</button>
        </div>
      )}
      {scopeOpen && (
        <div role="dialog" aria-label="Aplicar em quais parcelas?">
          <button onClick={confirmScope}>Todas do grupo</button>
        </div>
      )}
    </div>
  );
}

function openEditor() { fireEvent.click(screen.getByText("Editar transação")); }
function setField(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function save() { fireEvent.click(screen.getByText("Salvar")); }
function confirmScope() { fireEvent.click(screen.getByText("Todas do grupo")); }

function assertOnlyAllowedKeys(payload: Payload) {
  const allowed = new Set<string>(ALLOWED_PAYLOAD_KEYS);
  for (const k of Object.keys(payload)) {
    expect(allowed.has(k), `chave não permitida no payload: ${k}`).toBe(true);
  }
}

function assertRowsInvariant(rows: InstallmentGroupRow[], expectedCosmetic?: Partial<InstallmentGroupRow>) {
  const n = rows[0].total_installments as number;
  const source = rows[0].installment_source_amount as number;
  for (const r of rows) {
    expect(round2(r.amount)).toBe(r.amount);                 // sem sub-cent
    expect(r.total_installments).toBe(n);
    expect(r.installment_source_amount).toBe(source);
  }
  const sum = rows.reduce((s, r) => s + r.amount, 0);
  expect(Math.abs(sum - source)).toBeLessThanOrEqual(n * CENT + 1e-9);
  expect(validateGroupCoherence(rows, expectedCosmetic ? {
    category: expectedCosmetic.category,
    icon: expectedCosmetic.icon,
    card: expectedCosmetic.card,
    bank_account_id: expectedCosmetic.bank_account_id,
  } : undefined).ok).toBe(true);
}

describe("Integração — payload saneado + parcelas geradas mantêm drift ≤ N¢", () => {
  it("edição mista (inválidos + válidos): payload só tem campos saneados e parcelas coerentes", () => {
    let result: PersistResult | null = null;
    render(<EditHarness onPersist={(r) => { result = r; }} />);

    openEditor();
    // Inválidos:
    setField("nome", "   ");
    setField("data", "");
    // Válidos estruturais:
    setField("valor", "100");         // nova parcela → nova source (100×N)
    setField("parcelas", "3");        // novo N
    // Cosméticos:
    setField("categoria", "Alimentação");
    setField("icone", "🍔");
    setField("cartao", "XP");
    save();

    expect(screen.getByRole("dialog", { name: "Aplicar em quais parcelas?" })).toBeInTheDocument();
    confirmScope();

    const r = result!;
    // 1) payload contém APENAS chaves permitidas
    assertOnlyAllowedKeys(r.payload);
    // 2) inválidos foram descartados
    expect(r.payload.name).toBe(originalTx.name);
    expect(r.payload.date).toBe(originalTx.date);
    expect(r.droppedInvalidFields.sort()).toEqual(["date", "name"].sort());
    // 3) válidos foram gravados
    expect(r.payload.amount).toBe(100);
    expect(r.payload.total_installments).toBe(3);
    // 4) cosméticos propagam para todas as parcelas
    for (const row of r.rows) {
      expect(row.category).toBe("Alimentação");
      expect(row.icon).toBe("🍔");
      expect(row.card).toBe("XP");
    }
    // 5) drift dentro da tolerância + coerência
    expect(r.source).toBe(round2(100 * 3));
    assertRowsInvariant(r.rows, { category: "Alimentação", icon: "🍔", card: "XP" });
  });

  it("valor que gera dízima (100/3 = 33,33...): drift ≤ N¢ após regenerar", () => {
    let result: PersistResult | null = null;
    render(<EditHarness onPersist={(r) => { result = r; }} />);

    openEditor();
    setField("nome", "");            // inválido
    setField("parcelas", "3");       // válido, mas ainda amount original = 83,33
    // amount continua sendo o original 83,33; usamos direto o valor para reforçar dízima
    setField("valor", "33.33");
    setField("categoria", "Casa");
    save();
    confirmScope();

    const r = result!;
    // 33,33 × 3 = 99,99 → source arredondado; drift natural 1¢
    expect(r.payload.amount).toBe(33.33);
    expect(r.payload.total_installments).toBe(3);
    expect(r.source).toBe(99.99);
    assertRowsInvariant(r.rows);
    const sum = r.rows.reduce((s, x) => s + x.amount, 0);
    expect(Math.abs(sum - r.source)).toBeLessThanOrEqual(3 * CENT + 1e-9);
  });

  it("apenas cosméticos: gate NÃO abre, payload persiste sem tocar em estrutura, drift preserva original", () => {
    let result: PersistResult | null = null;
    render(<EditHarness onPersist={(r) => { result = r; }} />);

    openEditor();
    setField("categoria", "Transporte");
    setField("icone", "🚗");
    setField("cartao", "Itaú");
    save();

    expect(screen.queryByRole("dialog", { name: "Aplicar em quais parcelas?" })).toBeNull();
    const r = result!;
    expect(r.scopeOpened).toBe(false);
    expect(r.payload.name).toBe(originalTx.name);
    expect(r.payload.amount).toBe(originalTx.amount);
    expect(r.payload.total_installments).toBe(originalTx.total_installments);
    expect(r.payload.date).toBe(originalTx.date);
    // Parcelas geradas mantêm invariantes do grupo original (1000/12 → drift ≤ 12¢)
    expect(r.source).toBe(ORIGINAL_SOURCE);
    assertRowsInvariant(r.rows, { category: "Transporte", icon: "🚗", card: "Itaú" });
  });

  it("TODOS estruturais inválidos: payload = original, parcelas idênticas ao grupo pré-edição", () => {
    let result: PersistResult | null = null;
    render(<EditHarness onPersist={(r) => { result = r; }} />);

    openEditor();
    setField("nome", "");
    setField("valor", "-5");
    setField("parcelas", "0");
    setField("data", "   ");
    // Um cosmético para forçar o save (mas o gate abre pelos estruturais também)
    setField("categoria", "X");
    save();
    confirmScope();

    const r = result!;
    assertOnlyAllowedKeys(r.payload);
    expect(r.payload.name).toBe(originalTx.name);
    expect(r.payload.amount).toBe(originalTx.amount);
    expect(r.payload.total_installments).toBe(originalTx.total_installments);
    expect(r.payload.date).toBe(originalTx.date);
    expect(r.droppedInvalidFields.sort()).toEqual(
      ["amount", "date", "name", "total_installments"].sort(),
    );
    expect(r.source).toBe(ORIGINAL_SOURCE);
    assertRowsInvariant(r.rows, { category: "X" });
  });

  it("N grande com valor quebrado: 777,77 em 5 parcelas mantém drift ≤ N¢", () => {
    let result: PersistResult | null = null;
    render(<EditHarness onPersist={(r) => { result = r; }} />);

    openEditor();
    setField("valor", "155.554");        // sub-cent — deve arredondar
    setField("parcelas", "5");
    setField("nome", "");                // inválido → descarta
    setField("categoria", "Y");
    save();
    confirmScope();

    const r = result!;
    // amount arredondado a 2 casas
    expect(round2(r.payload.amount)).toBe(r.payload.amount);
    expect(r.payload.total_installments).toBe(5);
    // Cada parcela em 2 casas, drift ≤ 5¢
    assertRowsInvariant(r.rows, { category: "Y" });
    const sum = r.rows.reduce((s, x) => s + x.amount, 0);
    expect(Math.abs(sum - r.source)).toBeLessThanOrEqual(5 * CENT + 1e-9);
  });
});
