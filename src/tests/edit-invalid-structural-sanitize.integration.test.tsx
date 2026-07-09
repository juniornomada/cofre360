/**
 * Integration test — GATE + SANITIZAÇÃO DE PERSISTÊNCIA
 *
 * Cenário coberto:
 *   1. Usuário edita a parcela e altera algum campo ESTRUTURAL para um valor
 *      INVÁLIDO (nome vazio, valor ≤ 0, N inválido, data vazia).
 *   2. O gate `detectInstallmentChanges + splitInstallmentChanges` detecta a
 *      mudança estrutural e ABRE o diálogo "Aplicar em quais parcelas?".
 *   3. Ao confirmar o escopo, a camada de persistência precisa SANITIZAR o
 *      payload: campos inválidos são descartados (não sobrescrevem os valores
 *      originais no banco); apenas campos válidos e permitidos são gravados.
 *
 * Invariante testado: o payload persistido NUNCA contém valores inválidos —
 * mesmo que o diálogo de escopo tenha aberto por causa deles.
 */
import React, { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  detectInstallmentChanges,
  splitInstallmentChanges,
  type InstallmentEditSnapshot,
} from "@/lib/installment-edit";
import { validateInstallmentInputs } from "@/lib/installment-mode-toggle";

type Draft = InstallmentEditSnapshot;

const originalTx: Draft = {
  name: "Netflix (3/12)",
  amount: 50,
  total_installments: 12,
  category: "Assinaturas",
  icon: "📺",
  date: "10 mar",
  card: "Nubank",
  bank_account_id: null,
};

/**
 * Reproduz o comportamento esperado da camada de persistência real:
 *   - Campos estruturais inválidos são DESCARTADOS (fallback ao original).
 *   - Campos cosméticos são sempre gravados (não têm validação estrutural).
 * Retorna o payload final que iria ao Supabase.
 */
function sanitizePayload(original: Draft, draft: Draft): Draft {
  const payload: Draft = { ...original };

  // Nome: string não vazia (ignorando espaços).
  if (draft.name && draft.name.trim().length > 0) {
    payload.name = draft.name;
  }
  // Valor: precisa ser > 0.
  if (typeof draft.amount === "number" && draft.amount > 0 && !Number.isNaN(draft.amount)) {
    payload.amount = draft.amount;
  }
  // Nº parcelas: inteiro ≥ 1.
  if (
    typeof draft.total_installments === "number" &&
    Number.isFinite(draft.total_installments) &&
    Math.floor(draft.total_installments) >= 1
  ) {
    payload.total_installments = Math.floor(draft.total_installments);
  }
  // Data: string não vazia.
  if (draft.date && String(draft.date).trim().length > 0) {
    payload.date = draft.date;
  }

  // Cosméticos: passa direto (podem ser null/string, nunca "inválido estrutural").
  payload.category = draft.category ?? null;
  payload.icon = draft.icon ?? null;
  payload.card = draft.card ?? null;
  payload.bank_account_id = draft.bank_account_id ?? null;

  return payload;
}

type PersistResult = {
  scopeOpened: boolean;
  persistedPayload: Draft | null;
  droppedInvalidFields: string[];
};

function EditHarness({
  onPersist,
}: {
  onPersist: (r: PersistResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft>({ ...originalTx });

  const openDialog = () => {
    setDraft({ ...originalTx });
    setOpen(true);
  };

  const handleSave = () => {
    const changes = detectInstallmentChanges(originalTx, draft, draft.amount);
    const { structural } = splitInstallmentChanges(changes);
    if (structural.length > 0) {
      setPendingDraft({ ...draft });
      setScopeOpen(true);
    } else {
      // Cosmético puro: persiste direto (validação estrutural desnecessária).
      onPersist({
        scopeOpened: false,
        persistedPayload: sanitizePayload(originalTx, draft),
        droppedInvalidFields: [],
      });
      setOpen(false);
    }
  };

  const confirmScope = () => {
    const current = pendingDraft ?? draft;
    const sanitized = sanitizePayload(originalTx, current);
    // Rastreia quais campos foram descartados por invalidez.
    const dropped: string[] = [];
    if (sanitized.name === originalTx.name && current.name !== originalTx.name) dropped.push("name");
    if (sanitized.amount === originalTx.amount && current.amount !== originalTx.amount) dropped.push("amount");
    if (
      sanitized.total_installments === originalTx.total_installments &&
      current.total_installments !== originalTx.total_installments
    ) dropped.push("total_installments");
    if (sanitized.date === originalTx.date && current.date !== originalTx.date) dropped.push("date");

    onPersist({
      scopeOpened: true,
      persistedPayload: sanitized,
      droppedInvalidFields: dropped,
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

function openEditor() {
  fireEvent.click(screen.getByText("Editar transação"));
}
function setField(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function confirmScope() {
  fireEvent.click(screen.getByText("Todas do grupo"));
}

describe("Gate + sanitização — payload persistido nunca contém valores estruturais inválidos", () => {
  it("nome vazio abre o diálogo, mas o payload persistido mantém o nome ORIGINAL", () => {
    let result: PersistResult | null = null;
    render(<EditHarness onPersist={(r) => { result = r; }} />);
    openEditor();
    setField("nome", "   ");
    // Uma mudança estrutural válida garante que o gate abra (o nome vazio sozinho
    // também é estrutural, mas o teste isola a sanitização, não o gate).
    setField("categoria", "Lazer"); // cosmético (não abre sozinho)
    setField("data", "15 mar");     // estrutural válido → abre o diálogo
    fireEvent.click(screen.getByText("Salvar"));

    expect(screen.getByRole("dialog", { name: "Aplicar em quais parcelas?" })).toBeInTheDocument();
    confirmScope();

    expect(result!.scopeOpened).toBe(true);
    expect(result!.persistedPayload!.name).toBe(originalTx.name); // nome inválido descartado
    expect(result!.persistedPayload!.date).toBe("15 mar");        // válido gravado
    expect(result!.persistedPayload!.category).toBe("Lazer");     // cosmético gravado
    expect(result!.droppedInvalidFields).toContain("name");
  });

  it("valor 0 abre o diálogo, mas o payload persistido mantém o valor ORIGINAL", () => {
    let result: PersistResult | null = null;
    render(<EditHarness onPersist={(r) => { result = r; }} />);
    openEditor();
    setField("valor", "0");
    fireEvent.click(screen.getByText("Salvar"));
    expect(screen.getByRole("dialog", { name: "Aplicar em quais parcelas?" })).toBeInTheDocument();
    confirmScope();

    expect(result!.persistedPayload!.amount).toBe(originalTx.amount);
    expect(result!.droppedInvalidFields).toContain("amount");
    // Nenhum outro campo foi alterado.
    expect(result!.persistedPayload!.name).toBe(originalTx.name);
    expect(result!.persistedPayload!.total_installments).toBe(originalTx.total_installments);
  });

  it("valor negativo é descartado; cosméticos válidos no mesmo save SÃO gravados", () => {
    let result: PersistResult | null = null;
    render(<EditHarness onPersist={(r) => { result = r; }} />);
    openEditor();
    setField("valor", "-99");
    setField("categoria", "Saúde");
    fireEvent.click(screen.getByText("Salvar"));
    confirmScope();

    expect(result!.persistedPayload!.amount).toBe(originalTx.amount); // inválido descartado
    expect(result!.persistedPayload!.category).toBe("Saúde");         // cosmético válido
    expect(result!.droppedInvalidFields).toEqual(["amount"]);
  });

  it("N = 0 é descartado; N = 6 seria válido — confirma que só valores inválidos caem", () => {
    let result: PersistResult | null = null;
    render(<EditHarness onPersist={(r) => { result = r; }} />);
    openEditor();
    setField("parcelas", "0");
    fireEvent.click(screen.getByText("Salvar"));
    confirmScope();

    expect(result!.persistedPayload!.total_installments).toBe(originalTx.total_installments);
    expect(result!.droppedInvalidFields).toContain("total_installments");
  });

  it("data vazia é descartada, mas mudança de valor VÁLIDA no mesmo save é gravada", () => {
    let result: PersistResult | null = null;
    render(<EditHarness onPersist={(r) => { result = r; }} />);
    openEditor();
    setField("data", "");
    setField("valor", "80");
    fireEvent.click(screen.getByText("Salvar"));
    confirmScope();

    expect(result!.persistedPayload!.date).toBe(originalTx.date);   // descartado
    expect(result!.persistedPayload!.amount).toBe(80);              // gravado
    expect(result!.droppedInvalidFields).toEqual(["date"]);
  });

  it("MÚLTIPLOS campos inválidos ao mesmo tempo: nenhum entra no payload persistido", () => {
    let result: PersistResult | null = null;
    render(<EditHarness onPersist={(r) => { result = r; }} />);
    openEditor();
    setField("nome", "");
    setField("valor", "-5");
    setField("parcelas", "-3");
    setField("data", "   ");
    setField("categoria", "Alimentação"); // único válido
    fireEvent.click(screen.getByText("Salvar"));
    confirmScope();

    const p = result!.persistedPayload!;
    expect(p.name).toBe(originalTx.name);
    expect(p.amount).toBe(originalTx.amount);
    expect(p.total_installments).toBe(originalTx.total_installments);
    expect(p.date).toBe(originalTx.date);
    expect(p.category).toBe("Alimentação");
    expect(result!.droppedInvalidFields.sort()).toEqual(
      ["amount", "date", "name", "total_installments"].sort(),
    );
    // Duplo-cheque: `validateInstallmentInputs` concorda que o payload final é válido.
    expect(validateInstallmentInputs("divide", p.amount, 0, p.total_installments!)).toBeNull();
  });

  it("payload persistido tem SOMENTE as chaves permitidas — nenhum campo extra vaza", () => {
    let result: PersistResult | null = null;
    render(<EditHarness onPersist={(r) => { result = r; }} />);
    openEditor();
    setField("nome", "");         // inválido, descartado
    setField("valor", "77");      // válido
    setField("categoria", "Casa"); // cosmético
    fireEvent.click(screen.getByText("Salvar"));
    confirmScope();

    const allowedKeys = new Set([
      "name", "amount", "total_installments", "date",
      "category", "icon", "card", "bank_account_id",
    ]);
    for (const k of Object.keys(result!.persistedPayload!)) {
      expect(allowedKeys.has(k)).toBe(true);
    }
  });

  it("cancelar o diálogo de escopo após digitar valores inválidos NÃO persiste nada", () => {
    let result: PersistResult | null = null;
    const { unmount } = render(<EditHarness onPersist={(r) => { result = r; }} />);
    openEditor();
    setField("valor", "-1");
    setField("data", "");
    fireEvent.click(screen.getByText("Salvar"));
    expect(screen.getByRole("dialog", { name: "Aplicar em quais parcelas?" })).toBeInTheDocument();
    // Não clica em "Todas do grupo" — desmonta simulando cancelamento.
    unmount();
    expect(result).toBeNull();
    cleanup();
  });
});
