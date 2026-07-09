/**
 * Integration test — VALIDAÇÃO VISÍVEL NO DIÁLOGO DE EDIÇÃO
 *
 * Verifica o contrato de UX exigido pelo formulário de edição de parcela:
 *   - Nome vazio        → erro "Informe um nome."
 *   - Valor ≤ 0 / NaN   → erro "Informe um valor maior que zero."
 *   - Data vazia        → erro "Informe uma data válida."
 *   - Nº parcelas < 1   → erro "Nº de parcelas deve ser ≥ 1."
 *
 * E o botão "Salvar" precisa ficar DESABILITADO enquanto qualquer campo
 * estrutural estiver inválido.
 */
import React, { useMemo, useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

type Draft = {
  name: string;
  amount: number;
  total_installments: number;
  date: string;
};

const originalTx: Draft = {
  name: "Netflix (3/12)",
  amount: 50,
  total_installments: 12,
  date: "10 mar",
};

/** Regras de validação exibidas no diálogo. */
function validateDraft(d: Draft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.name || d.name.trim().length === 0) {
    errors.name = "Informe um nome.";
  }
  if (
    typeof d.amount !== "number" ||
    Number.isNaN(d.amount) ||
    d.amount <= 0
  ) {
    errors.amount = "Informe um valor maior que zero.";
  }
  if (!d.date || String(d.date).trim().length === 0) {
    errors.date = "Informe uma data válida.";
  }
  if (
    typeof d.total_installments !== "number" ||
    !Number.isFinite(d.total_installments) ||
    Math.floor(d.total_installments) < 1
  ) {
    errors.total_installments = "Nº de parcelas deve ser ≥ 1.";
  }
  return errors;
}

function EditHarness({ onSave }: { onSave: (d: Draft) => void }) {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState<Draft>({ ...originalTx });

  const errors = useMemo(() => validateDraft(draft), [draft]);
  const hasErrors = Object.keys(errors).length > 0;

  if (!open) return <button onClick={() => setOpen(true)}>Reabrir</button>;

  return (
    <div role="dialog" aria-label="Editar transação">
      <div>
        <input
          aria-label="nome"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        {errors.name && <span role="alert" data-field="name">{errors.name}</span>}
      </div>
      <div>
        <input
          aria-label="valor"
          type="number"
          value={Number.isNaN(draft.amount) ? "" : draft.amount}
          onChange={(e) =>
            setDraft({
              ...draft,
              amount: e.target.value === "" ? NaN : Number(e.target.value),
            })
          }
        />
        {errors.amount && <span role="alert" data-field="amount">{errors.amount}</span>}
      </div>
      <div>
        <input
          aria-label="parcelas"
          type="number"
          value={Number.isNaN(draft.total_installments) ? "" : draft.total_installments}
          onChange={(e) =>
            setDraft({
              ...draft,
              total_installments: e.target.value === "" ? NaN : Number(e.target.value),
            })
          }
        />
        {errors.total_installments && (
          <span role="alert" data-field="total_installments">{errors.total_installments}</span>
        )}
      </div>
      <div>
        <input
          aria-label="data"
          value={draft.date}
          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
        />
        {errors.date && <span role="alert" data-field="date">{errors.date}</span>}
      </div>
      <button
        onClick={() => !hasErrors && onSave(draft)}
        disabled={hasErrors}
      >
        Salvar
      </button>
    </div>
  );
}

function setField(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function errorFor(field: string) {
  return screen.queryByText((_, el) => el?.getAttribute("data-field") === field);
}
function saveBtn() {
  return screen.getByText("Salvar") as HTMLButtonElement;
}

describe("Validação do diálogo de edição — mensagens e Salvar desabilitado", () => {
  it("draft original é válido → nenhuma mensagem visível, Salvar habilitado", () => {
    render(<EditHarness onSave={() => {}} />);
    expect(errorFor("name")).toBeNull();
    expect(errorFor("amount")).toBeNull();
    expect(errorFor("date")).toBeNull();
    expect(errorFor("total_installments")).toBeNull();
    expect(saveBtn().disabled).toBe(false);
  });

  it("nome vazio mostra 'Informe um nome.' e desabilita Salvar", () => {
    render(<EditHarness onSave={() => {}} />);
    setField("nome", "");
    expect(errorFor("name")).toHaveTextContent("Informe um nome.");
    expect(saveBtn().disabled).toBe(true);
  });

  it("nome só com espaços é tratado como vazio", () => {
    render(<EditHarness onSave={() => {}} />);
    setField("nome", "   ");
    expect(errorFor("name")).toHaveTextContent("Informe um nome.");
    expect(saveBtn().disabled).toBe(true);
  });

  it("valor 0 mostra 'Informe um valor maior que zero.' e desabilita Salvar", () => {
    render(<EditHarness onSave={() => {}} />);
    setField("valor", "0");
    expect(errorFor("amount")).toHaveTextContent("Informe um valor maior que zero.");
    expect(saveBtn().disabled).toBe(true);
  });

  it("valor negativo mostra a mesma mensagem e desabilita Salvar", () => {
    render(<EditHarness onSave={() => {}} />);
    setField("valor", "-10");
    expect(errorFor("amount")).toHaveTextContent("Informe um valor maior que zero.");
    expect(saveBtn().disabled).toBe(true);
  });

  it("valor vazio (NaN) mostra a mensagem e desabilita Salvar", () => {
    render(<EditHarness onSave={() => {}} />);
    setField("valor", "");
    expect(errorFor("amount")).toHaveTextContent("Informe um valor maior que zero.");
    expect(saveBtn().disabled).toBe(true);
  });

  it("data vazia mostra 'Informe uma data válida.' e desabilita Salvar", () => {
    render(<EditHarness onSave={() => {}} />);
    setField("data", "");
    expect(errorFor("date")).toHaveTextContent("Informe uma data válida.");
    expect(saveBtn().disabled).toBe(true);
  });

  it("data com só espaços é tratada como vazia", () => {
    render(<EditHarness onSave={() => {}} />);
    setField("data", "   ");
    expect(errorFor("date")).toHaveTextContent("Informe uma data válida.");
    expect(saveBtn().disabled).toBe(true);
  });

  it("Nº parcelas 0 mostra 'Nº de parcelas deve ser ≥ 1.' e desabilita Salvar", () => {
    render(<EditHarness onSave={() => {}} />);
    setField("parcelas", "0");
    expect(errorFor("total_installments")).toHaveTextContent("Nº de parcelas deve ser ≥ 1.");
    expect(saveBtn().disabled).toBe(true);
  });

  it("múltiplos erros exibem TODAS as mensagens simultaneamente", () => {
    render(<EditHarness onSave={() => {}} />);
    setField("nome", "");
    setField("valor", "-1");
    setField("data", "");
    setField("parcelas", "-3");
    expect(errorFor("name")).not.toBeNull();
    expect(errorFor("amount")).not.toBeNull();
    expect(errorFor("date")).not.toBeNull();
    expect(errorFor("total_installments")).not.toBeNull();
    expect(saveBtn().disabled).toBe(true);
  });

  it("corrigir todos os campos remove as mensagens e reabilita Salvar", () => {
    render(<EditHarness onSave={() => {}} />);
    setField("nome", "");
    setField("valor", "0");
    setField("data", "");
    expect(saveBtn().disabled).toBe(true);

    setField("nome", "Spotify");
    setField("valor", "55");
    setField("data", "12 mar");

    expect(errorFor("name")).toBeNull();
    expect(errorFor("amount")).toBeNull();
    expect(errorFor("date")).toBeNull();
    expect(saveBtn().disabled).toBe(false);
  });

  it("clique em Salvar com erros NÃO dispara o callback", () => {
    let saved: Draft | null = null;
    render(<EditHarness onSave={(d) => { saved = d; }} />);
    setField("nome", "");
    fireEvent.click(saveBtn());
    expect(saved).toBeNull();
  });

  it("clique em Salvar sem erros dispara o callback com o draft", () => {
    let saved: Draft | null = null;
    render(<EditHarness onSave={(d) => { saved = d; }} />);
    setField("valor", "77");
    fireEvent.click(saveBtn());
    expect(saved).not.toBeNull();
    expect(saved!.amount).toBe(77);
    cleanup();
  });
});
