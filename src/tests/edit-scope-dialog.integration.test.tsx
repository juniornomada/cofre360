/**
 * Integration-level test that mirrors the save gate in `src/routes/transactions.tsx`.
 *
 * Rendering the whole `/transactions` route (1700+ lines, TanStack Router, Supabase,
 * dozens of subcomponents) would be brittle and slow. Instead, we build a
 * minimal harness that reuses the SAME `detectInstallmentChanges` +
 * `splitInstallmentChanges` gate the real route uses (see transactions.tsx L542–L581).
 *
 * The harness exposes an "editable transaction" dialog with all the fields the
 * real route edits (name, amount, N, date, category, icon, card, bank account)
 * and, on Save, opens the "Aplicar em quais parcelas?" scope dialog iff any
 * STRUCTURAL change is detected. Cosmetic-only changes save silently.
 */
import React, { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  detectInstallmentChanges,
  splitInstallmentChanges,
  type InstallmentEditSnapshot,
} from "@/lib/installment-edit";

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

function EditHarness({ onSaved }: { onSaved: (mode: "silent" | "with-dialog") => void }) {
  const [open, setOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({ ...originalTx });

  const openDialog = () => {
    setDraft({ ...originalTx });
    setOpen(true);
  };

  const handleSave = () => {
    // Same gate as transactions.tsx (L548–L579).
    const changes = detectInstallmentChanges(originalTx, draft, draft.amount);
    const { structural } = splitInstallmentChanges(changes);
    if (structural.length > 0) {
      setScopeOpen(true);
      onSaved("with-dialog");
    } else {
      setOpen(false);
      onSaved("silent");
    }
  };

  return (
    <div>
      <button onClick={openDialog}>Editar transação</button>

      {open && (
        <div role="dialog" aria-label="Editar transação">
          <label>
            Nome
            <input
              aria-label="nome"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            Valor
            <input
              aria-label="valor"
              type="number"
              value={draft.amount}
              onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })}
            />
          </label>
          <label>
            Nº parcelas
            <input
              aria-label="parcelas"
              type="number"
              value={draft.total_installments ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, total_installments: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Data
            <input
              aria-label="data"
              value={draft.date ?? ""}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            />
          </label>
          <label>
            Categoria
            <input
              aria-label="categoria"
              value={draft.category ?? ""}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            />
          </label>
          <label>
            Ícone
            <input
              aria-label="icone"
              value={draft.icon ?? ""}
              onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
            />
          </label>
          <label>
            Cartão
            <input
              aria-label="cartao"
              value={draft.card ?? ""}
              onChange={(e) => setDraft({ ...draft, card: e.target.value })}
            />
          </label>
          <label>
            Conta
            <input
              aria-label="conta"
              value={draft.bank_account_id ?? ""}
              onChange={(e) => setDraft({ ...draft, bank_account_id: e.target.value })}
            />
          </label>
          <button onClick={handleSave}>Salvar</button>
          <button onClick={() => setOpen(false)}>Cancelar</button>
        </div>
      )}

      {scopeOpen && (
        <div role="dialog" aria-label="Aplicar em quais parcelas?">
          <p>Deseja aplicar em todas as parcelas do grupo?</p>
          <button onClick={() => setScopeOpen(false)}>Somente esta</button>
          <button onClick={() => setScopeOpen(false)}>Todas do grupo</button>
        </div>
      )}
    </div>
  );
}

function openEditor() {
  fireEvent.click(screen.getByText("Editar transação"));
  expect(screen.getByRole("dialog", { name: "Editar transação" })).toBeInTheDocument();
}

function setField(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function scopeDialogVisible() {
  return screen.queryByRole("dialog", { name: "Aplicar em quais parcelas?" }) !== null;
}

describe("Top-level edit flow — scope dialog visibility mirrors structural vs cosmetic changes", () => {
  it("abre a modal de edição ao clicar em 'Editar transação'", () => {
    render(<EditHarness onSaved={() => {}} />);
    openEditor();
    expect(screen.getByLabelText("nome")).toHaveValue(originalTx.name);
    expect(screen.getByLabelText("valor")).toHaveValue(originalTx.amount);
  });

  it("mudança APENAS cosmética (categoria) NÃO abre o diálogo de escopo", () => {
    let mode: string | null = null;
    render(<EditHarness onSaved={(m) => { mode = m; }} />);
    openEditor();
    setField("categoria", "Lazer");
    fireEvent.click(screen.getByText("Salvar"));
    expect(scopeDialogVisible()).toBe(false);
    expect(mode).toBe("silent");
  });

  it("mudança APENAS cosmética (ícone + cartão + conta) NÃO abre o diálogo", () => {
    let mode: string | null = null;
    render(<EditHarness onSaved={(m) => { mode = m; }} />);
    openEditor();
    setField("icone", "🎬");
    setField("cartao", "XP");
    setField("conta", "acc-1");
    fireEvent.click(screen.getByText("Salvar"));
    expect(scopeDialogVisible()).toBe(false);
    expect(mode).toBe("silent");
  });

  it("mudança de VALOR (estrutural) ABRE o diálogo de escopo", () => {
    let mode: string | null = null;
    render(<EditHarness onSaved={(m) => { mode = m; }} />);
    openEditor();
    setField("valor", "75");
    fireEvent.click(screen.getByText("Salvar"));
    expect(scopeDialogVisible()).toBe(true);
    expect(mode).toBe("with-dialog");
  });

  it("mudança de NOME (estrutural) ABRE o diálogo", () => {
    render(<EditHarness onSaved={() => {}} />);
    openEditor();
    setField("nome", "Spotify (3/12)");
    fireEvent.click(screen.getByText("Salvar"));
    expect(scopeDialogVisible()).toBe(true);
  });

  it("mudança de Nº DE PARCELAS (estrutural) ABRE o diálogo", () => {
    render(<EditHarness onSaved={() => {}} />);
    openEditor();
    setField("parcelas", "6");
    fireEvent.click(screen.getByText("Salvar"));
    expect(scopeDialogVisible()).toBe(true);
  });

  it("mudança de DATA (estrutural) ABRE o diálogo", () => {
    render(<EditHarness onSaved={() => {}} />);
    openEditor();
    setField("data", "15 mar");
    fireEvent.click(screen.getByText("Salvar"));
    expect(scopeDialogVisible()).toBe(true);
  });

  it("estrutural + cosmético juntos ABRE o diálogo (estrutural domina)", () => {
    render(<EditHarness onSaved={() => {}} />);
    openEditor();
    setField("valor", "75");
    setField("categoria", "Lazer");
    fireEvent.click(screen.getByText("Salvar"));
    expect(scopeDialogVisible()).toBe(true);
  });

  it("apenas alteração do sufixo n/N no nome NÃO abre o diálogo (sufixo é ignorado)", () => {
    let mode: string | null = null;
    render(<EditHarness onSaved={(m) => { mode = m; }} />);
    openEditor();
    setField("nome", "Netflix (4/12)");
    fireEvent.click(screen.getByText("Salvar"));
    expect(scopeDialogVisible()).toBe(false);
    expect(mode).toBe("silent");
  });

  it("ciclo: cosmético (silent) → reabre → estrutural (dialog) → confirma → some", () => {
    const modes: string[] = [];
    render(<EditHarness onSaved={(m) => modes.push(m)} />);

    // 1) Cosmético: salva silencioso
    openEditor();
    setField("categoria", "Lazer");
    fireEvent.click(screen.getByText("Salvar"));
    expect(scopeDialogVisible()).toBe(false);

    // 2) Reabre editor (estado reseta ao original no harness)
    cleanup();
    render(<EditHarness onSaved={(m) => modes.push(m)} />);
    openEditor();
    setField("valor", "80");
    fireEvent.click(screen.getByText("Salvar"));
    expect(scopeDialogVisible()).toBe(true);

    // 3) Confirma escopo → diálogo some
    fireEvent.click(screen.getByText("Todas do grupo"));
    expect(scopeDialogVisible()).toBe(false);

    expect(modes).toEqual(["silent", "with-dialog"]);
  });
});
