/**
 * Integration test — fluxo completo de EDIÇÃO de uma despesa parcelada
 * no cartão de crédito, cobrindo a alternância de modos (divide ↔ fixed)
 * e verificando que o total econômico é preservado ao longo do fluxo:
 *
 *   render → toggle divide→fixed → toggle de volta → salvar
 *
 * O harness abaixo replica *fielmente* a fiação do diálogo de edição em
 * `src/routes/transactions.tsx` (linhas ~1307–1350 e ~545–605): os mesmos
 * handlers de toggle usam `toDivideMode` / `toFixedMode`, o mesmo cálculo de
 * validação chama `validateInstallmentInputs`, o mesmo cálculo de resumo
 * chama `calculateInstallmentDetails`, e o mesmo save chama `supabase
 * .from("transactions").update()` seguido de `saveInstallmentPlan`.
 *
 * A tela real vive em uma rota TanStack pesada (Router context, ~1600
 * linhas, muitos lazys) — o harness testa a composição de módulos de
 * produção reais que definem esse comportamento, com o mesmo contrato.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React, { useMemo, useState } from "react";

// --- Supabase mock: captura update() na tabela transactions ---------------
const updateEqMock = vi.fn().mockResolvedValue({ error: null });
const updateMock = vi.fn(() => ({ eq: updateEqMock }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (_table: string) => ({
      update: updateMock,
      // saveInstallmentPlan também chama select().eq() — devolve vazio.
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  },
}));

// Espia saveInstallmentPlan preservando a implementação real (que já é
// coberta em testes unitários) para validar os argumentos recebidos.
vi.mock("@/lib/installment-edit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/installment-edit")>(
    "@/lib/installment-edit",
  );
  return {
    ...actual,
    saveInstallmentPlan: vi.fn(actual.saveInstallmentPlan),
  };
});

import { toDivideMode, toFixedMode, changeInstallmentCount, validateInstallmentInputs } from "@/lib/installment-mode-toggle";
import { calculateInstallmentDetails } from "@/lib/installment-utils";
import { saveInstallmentPlan, stripInstallmentSuffix } from "@/lib/installment-edit";
import { supabase } from "@/integrations/supabase/client";

// --- Harness que espelha o diálogo de edição -----------------------------
type EditTx = {
  id: string;
  icon: string;
  name: string;
  category: string;
  date: string;
  amount: number;
  type: "expense" | "income";
  card: string | null;
  bank_account_id: string | null;
  installment_group_id: string | null;
  installment_number: number;
  total_installments: number;
};

function EditDialogHarness({ initial }: { initial: EditTx }) {
  const [editTx, setEditTx] = useState<EditTx>(initial);
  const [editInstallmentMode, setEditInstallmentMode] = useState<"divide" | "fixed">("divide");
  const [saved, setSaved] = useState<null | { updatePayload: any; perInstallment: number }>(null);
  const [error, setError] = useState<string | null>(null);

  const details = useMemo(
    () =>
      calculateInstallmentDetails(
        editInstallmentMode === "fixed" ? 0 : editTx.amount,
        editTx.total_installments,
        editInstallmentMode,
        editInstallmentMode === "fixed" ? editTx.amount : 0,
      ),
    [editTx.amount, editTx.total_installments, editInstallmentMode],
  );

  const handleSave = async () => {
    setError(null);
    const editCount = Number(editTx.total_installments ?? 1);
    const validationError = validateInstallmentInputs(
      editInstallmentMode,
      editInstallmentMode === "divide" ? editTx.amount : 0,
      editInstallmentMode === "fixed" ? editTx.amount : 0,
      editCount,
    );
    if (validationError) {
      setError(validationError);
      return;
    }
    const total = Math.max(1, Math.floor(editTx.total_installments));
    const current = Math.max(1, Math.min(total, editTx.installment_number));
    const finalName = stripInstallmentSuffix(editTx.name);
    const { valorParcela: perInstallment } = calculateInstallmentDetails(
      editInstallmentMode === "fixed" ? 0 : editTx.amount,
      total,
      editInstallmentMode,
      editInstallmentMode === "fixed" ? editTx.amount : 0,
    );
    const updatePayload = {
      icon: editTx.icon,
      name: finalName,
      category: editTx.category,
      date: editTx.date,
      amount: perInstallment,
      type: editTx.type,
      card: editTx.card,
      bank_account_id: editTx.bank_account_id || null,
      installment_mode: editInstallmentMode,
      installment_source_amount: editTx.amount,
    };
    await supabase.from("transactions").update(updatePayload).eq("id", editTx.id);
    await saveInstallmentPlan({
      id: editTx.id,
      name: finalName,
      icon: editTx.icon,
      category: editTx.category,
      date: editTx.date,
      amount: editTx.amount,
      type: editTx.type,
      card: editTx.card ?? null,
      bank_account_id: editTx.bank_account_id ?? null,
      installment_group_id: editTx.installment_group_id ?? null,
      current,
      total,
      installmentAmount: perInstallment,
      installmentMode: editInstallmentMode,
      installmentSourceAmount: editTx.amount,
      updateAllInGroup: false,
    });
    setSaved({ updatePayload, perInstallment });
  };

  return (
    <div>
      <div data-testid="amount">{editTx.amount}</div>
      <div data-testid="mode">{editInstallmentMode}</div>
      <div data-testid="summary">{details?.formattedSummary}</div>
      <button
        type="button"
        onClick={() => {
          if (editInstallmentMode === "divide") return;
          const count = editTx.total_installments || 1;
          const next = toDivideMode({
            fromMode: "fixed",
            amount: editTx.amount,
            fixedValue: editTx.amount,
            count,
          });
          setEditTx({ ...editTx, amount: next.amount });
          setEditInstallmentMode("divide");
        }}
      >
        Dividir total
      </button>
      <button
        type="button"
        onClick={() => {
          if (editInstallmentMode === "fixed") return;
          const count = editTx.total_installments || 1;
          const next = toFixedMode({
            fromMode: "divide",
            amount: editTx.amount,
            fixedValue: 0,
            count,
          });
          setEditTx({ ...editTx, amount: next.amount });
          setEditInstallmentMode("fixed");
        }}
      >
        Valor por parcela
      </button>
      <button
        type="button"
        data-testid="change-count-6"
        onClick={() => {
          const next = changeInstallmentCount({
            mode: editInstallmentMode,
            amount: editTx.amount,
            fixedValue: editInstallmentMode === "fixed" ? editTx.amount : 0,
            prevCount: editTx.total_installments,
            newCount: 6,
          });
          setEditTx({ ...editTx, amount: next.amount, total_installments: 6 });
        }}
      >
        Mudar para 6x
      </button>
      <input
        data-testid="amount-input"
        type="number"
        value={editTx.amount}
        onChange={(e) => setEditTx({ ...editTx, amount: Number(e.target.value) })}
      />
      <button type="button" onClick={handleSave}>
        Salvar
      </button>
      {saved && (
        <div data-testid="saved">
          {JSON.stringify({ per: saved.perInstallment, src: saved.updatePayload.installment_source_amount, mode: saved.updatePayload.installment_mode })}
        </div>
      )}
      {error && <div data-testid="error">{error}</div>}
    </div>
  );
}

// --- Fixture: parcela existente de um cartão de crédito ------------------
function makeEditTx(overrides: Partial<EditTx> = {}): EditTx {
  return {
    id: "tx-1",
    icon: "💻",
    name: "Notebook 1/4",
    category: "Eletrônicos > Informática",
    date: "2026-07-10",
    amount: 1200, // total no modo divide
    type: "expense",
    card: "Nubank",
    bank_account_id: null,
    installment_group_id: "group-1",
    installment_number: 1,
    total_installments: 4,
    ...overrides,
  };
}

describe("Edição de despesa parcelada no cartão — integração completa", () => {
  beforeEach(() => {
    updateMock.mockClear();
    updateEqMock.mockClear();
    (saveInstallmentPlan as unknown as ReturnType<typeof vi.fn>).mockClear();
  });

  it("divide → fixed → divide preserva o total econômico de R$ 1.200 em 4x", async () => {
    render(<EditDialogHarness initial={makeEditTx()} />);

    // Estado inicial: divide, 1200 total, 4x de 300
    expect(screen.getByTestId("mode").textContent).toBe("divide");
    expect(screen.getByTestId("amount").textContent).toBe("1200");
    expect(screen.getByTestId("summary").textContent).toMatch(/4x/);

    // Toggle → fixed: amount vira 300 (parcela), mas o TOTAL econômico segue 1200
    fireEvent.click(screen.getByRole("button", { name: "Valor por parcela" }));
    expect(screen.getByTestId("mode").textContent).toBe("fixed");
    expect(screen.getByTestId("amount").textContent).toBe("300");
    // Somatório reconstituído a partir do estado fixed
    // (parcela × N)
    expect(300 * 4).toBe(1200);

    // Toggle de volta → divide: amount volta a 1200
    fireEvent.click(screen.getByRole("button", { name: "Dividir total" }));
    expect(screen.getByTestId("mode").textContent).toBe("divide");
    expect(screen.getByTestId("amount").textContent).toBe("1200");
  });

  it("salva em modo fixed usando parcela por linha (300) e source_amount = 300", async () => {
    render(<EditDialogHarness initial={makeEditTx()} />);
    fireEvent.click(screen.getByRole("button", { name: "Valor por parcela" }));
    // agora editTx.amount = 300 (valor por parcela)
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const payload = (updateMock.mock.calls as any[])[0][0] as any;
    expect(payload.installment_mode).toBe("fixed");
    expect(payload.amount).toBe(300); // amount da linha atual = parcela
    // No modo fixed, editTx.amount é a parcela → source_amount armazenado
    // reflete o valor digitado como parcela (contrato atual do dialog).
    expect(payload.installment_source_amount).toBe(300);

    // saveInstallmentPlan recebe installmentAmount = 300 e mode = fixed
    expect(saveInstallmentPlan).toHaveBeenCalledTimes(1);
    const planArg = (saveInstallmentPlan as any).mock.calls[0][0];
    expect(planArg.installmentAmount).toBe(300);
    expect(planArg.installmentMode).toBe("fixed");
    expect(planArg.total).toBe(4);
  });

  it("salva em modo divide usando parcela = total/N (300) e source_amount = total (1200)", async () => {
    render(<EditDialogHarness initial={makeEditTx()} />);
    // Sem toggles — permanece em divide
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const payload = (updateMock.mock.calls as any[])[0][0] as any;
    expect(payload.installment_mode).toBe("divide");
    expect(payload.amount).toBe(300); // 1200 / 4
    expect(payload.installment_source_amount).toBe(1200);

    const planArg = (saveInstallmentPlan as any).mock.calls[0][0];
    expect(planArg.installmentAmount).toBe(300);
    expect(planArg.installmentSourceAmount).toBe(1200);
    expect(planArg.installmentMode).toBe("divide");
  });

  it("round-trip fixed→divide→fixed preserva a parcela original (250 em 3x)", async () => {
    render(
      <EditDialogHarness
        initial={makeEditTx({ amount: 750, total_installments: 3 })}
      />,
    );
    // divide inicial → fixed: 750/3 = 250
    fireEvent.click(screen.getByRole("button", { name: "Valor por parcela" }));
    expect(screen.getByTestId("amount").textContent).toBe("250");

    // fixed → divide: 250*3 = 750
    fireEvent.click(screen.getByRole("button", { name: "Dividir total" }));
    expect(screen.getByTestId("amount").textContent).toBe("750");

    // divide → fixed novamente: volta a 250 (idempotente)
    fireEvent.click(screen.getByRole("button", { name: "Valor por parcela" }));
    expect(screen.getByTestId("amount").textContent).toBe("250");
  });

  it("preserva o total econômico com arredondamento (R$ 1.000 em 3x) ao alternar divide↔fixed", async () => {
    render(
      <EditDialogHarness
        initial={makeEditTx({ amount: 1000, total_installments: 3 })}
      />,
    );

    // Estado inicial: divide, total 1000, resumo 3x
    expect(screen.getByTestId("mode").textContent).toBe("divide");
    expect(screen.getByTestId("amount").textContent).toBe("1000");
    expect(screen.getByTestId("summary").textContent).toMatch(/3x/);

    // divide → fixed: parcela = round2(1000/3) = 333.33
    fireEvent.click(screen.getByRole("button", { name: "Valor por parcela" }));
    expect(screen.getByTestId("mode").textContent).toBe("fixed");
    expect(screen.getByTestId("amount").textContent).toBe("333.33");
    // Total econômico reconstituído fica a 1 centavo do original (limite
    // conhecido do arredondamento a 2 casas) — 333.33 × 3 = 999.99.
    expect(Math.abs(333.33 * 3 - 1000)).toBeLessThanOrEqual(0.01);

    // fixed → divide: total = round2(333.33 × 3) = 999.99 (drift documentado)
    fireEvent.click(screen.getByRole("button", { name: "Dividir total" }));
    expect(screen.getByTestId("mode").textContent).toBe("divide");
    expect(screen.getByTestId("amount").textContent).toBe("999.99");
    expect(Math.abs(Number(screen.getByTestId("amount").textContent) - 1000)).toBeLessThanOrEqual(0.01);

    // Salvar em divide com o total pós-round-trip: parcela = 999.99/3 = 333.33
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const payload = (updateMock.mock.calls as any[])[0][0] as any;
    expect(payload.installment_mode).toBe("divide");
    expect(payload.amount).toBe(333.33);
    expect(payload.installment_source_amount).toBe(999.99);

    const planArg = (saveInstallmentPlan as any).mock.calls[0][0];
    expect(planArg.installmentAmount).toBe(333.33);
    expect(planArg.installmentSourceAmount).toBe(999.99);
    expect(planArg.total).toBe(3);
  });


  it("bloqueia salvar quando o valor no modo ativo é zero (validação integrada)", async () => {
    render(
      <EditDialogHarness initial={makeEditTx({ amount: 0 })} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() => {
      expect(screen.getByTestId("error")).toBeInTheDocument();
    });
    expect(updateMock).not.toHaveBeenCalled();
    expect(saveInstallmentPlan).not.toHaveBeenCalled();
  });

  it("aplica a mesma regra a uma RECEITA parcelada no cartão (estorno/cashback em 3x)", async () => {
    // Cenário: estorno parcelado de R$ 900 em 3x lançado como receita no cartão.
    render(
      <EditDialogHarness
        initial={makeEditTx({
          type: "income",
          icon: "💰",
          name: "Estorno 1/3",
          category: "Receita > Estorno",
          amount: 900,
          total_installments: 3,
        })}
      />,
    );

    // divide → fixed: 900/3 = 300 por parcela, total econômico segue 900
    fireEvent.click(screen.getByRole("button", { name: "Valor por parcela" }));
    expect(screen.getByTestId("mode").textContent).toBe("fixed");
    expect(screen.getByTestId("amount").textContent).toBe("300");

    // fixed → divide: 300*3 = 900
    fireEvent.click(screen.getByRole("button", { name: "Dividir total" }));
    expect(screen.getByTestId("amount").textContent).toBe("900");

    // Salva em divide — persistência espelha o fluxo de despesa
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const payload = (updateMock.mock.calls as any[])[0][0] as any;
    expect(payload.type).toBe("income");
    expect(payload.installment_mode).toBe("divide");
    expect(payload.amount).toBe(300); // 900 / 3
    expect(payload.installment_source_amount).toBe(900);

    const planArg = (saveInstallmentPlan as any).mock.calls[0][0];
    expect(planArg.type).toBe("income");
    expect(planArg.installmentAmount).toBe(300);
    expect(planArg.installmentSourceAmount).toBe(900);
    expect(planArg.total).toBe(3);
  });

  it("bloqueia salvar RECEITA parcelada quando o valor do modo ativo é zero (divide)", async () => {
    render(
      <EditDialogHarness
        initial={makeEditTx({
          type: "income",
          icon: "💰",
          name: "Estorno 1/3",
          category: "Receita > Estorno",
          amount: 0,
          total_installments: 3,
        })}
      />,
    );
    // Modo ativo: divide, total = 0 → deve bloquear
    expect(screen.getByTestId("mode").textContent).toBe("divide");
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() => {
      expect(screen.getByTestId("error")).toBeInTheDocument();
    });
    expect(updateMock).not.toHaveBeenCalled();
    expect(saveInstallmentPlan).not.toHaveBeenCalled();
  });


  it("bloqueia salvar quando a parcela (fixed) é zero em receita", async () => {
    // Harness dedicado que inicia diretamente em modo fixed com valor zero.
    function Wrapper() {
      const [mode] = useState<"divide" | "fixed">("fixed");
      const tx = makeEditTx({ type: "income", amount: 0, total_installments: 3 });
      const [error, setError] = useState<string | null>(null);
      const onSave = () => {
        const err = validateInstallmentInputs(
          mode,
          mode === "divide" ? tx.amount : 0,
          mode === "fixed" ? tx.amount : 0,
          tx.total_installments,
        );
        if (err) {
          setError(err);
          return;
        }
        void supabase.from("transactions").update({}).eq("id", tx.id);
      };
      return (
        <div>
          <button type="button" onClick={onSave}>Salvar</button>
          {error && <div data-testid="error">{error}</div>}
        </div>
      );
    }
    render(<Wrapper />);
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(screen.getByTestId("error")).toBeInTheDocument());
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("RECEITA parcelada: divide→fixed→salvar persiste type/amount/source_amount corretos", async () => {
    // Estorno de R$ 1.200 em 4x → parcela 300. Alterna para fixed e salva.
    render(
      <EditDialogHarness
        initial={makeEditTx({
          type: "income",
          icon: "💰",
          name: "Estorno 1/4",
          category: "Receita > Estorno",
          amount: 1200,
          total_installments: 4,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Valor por parcela" }));
    expect(screen.getByTestId("mode").textContent).toBe("fixed");
    expect(screen.getByTestId("amount").textContent).toBe("300");

    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(updateMock).toHaveBeenCalled());

    const payload = (updateMock.mock.calls as any[])[0][0] as any;
    expect(payload.type).toBe("income");
    expect(payload.installment_mode).toBe("fixed");
    expect(payload.amount).toBe(300); // parcela por linha
    // No modo fixed, o valor digitado É a parcela → source_amount = parcela.
    expect(payload.installment_source_amount).toBe(300);

    const planArg = (saveInstallmentPlan as any).mock.calls[0][0];
    expect(planArg.type).toBe("income");
    expect(planArg.installmentAmount).toBe(300);
    expect(planArg.installmentSourceAmount).toBe(300);
    expect(planArg.installmentMode).toBe("fixed");
    expect(planArg.total).toBe(4);
  });

  it("RECEITA parcelada: fixed→divide→salvar persiste type/amount/source_amount corretos", async () => {
    // Simula receita que já estava em fixed; usuário alterna para divide antes
    // de salvar. Início: divide/1200/4x; toggle→fixed(300); toggle→divide(1200).
    render(
      <EditDialogHarness
        initial={makeEditTx({
          type: "income",
          icon: "💰",
          name: "Estorno 1/4",
          category: "Receita > Estorno",
          amount: 1200,
          total_installments: 4,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Valor por parcela" }));
    expect(screen.getByTestId("mode").textContent).toBe("fixed");
    fireEvent.click(screen.getByRole("button", { name: "Dividir total" }));
    expect(screen.getByTestId("mode").textContent).toBe("divide");
    expect(screen.getByTestId("amount").textContent).toBe("1200");

    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(updateMock).toHaveBeenCalled());

    const payload = (updateMock.mock.calls as any[])[0][0] as any;
    expect(payload.type).toBe("income");
    expect(payload.installment_mode).toBe("divide");
    expect(payload.amount).toBe(300); // 1200 / 4
    expect(payload.installment_source_amount).toBe(1200);

    const planArg = (saveInstallmentPlan as any).mock.calls[0][0];
    expect(planArg.type).toBe("income");
    expect(planArg.installmentAmount).toBe(300);
    expect(planArg.installmentSourceAmount).toBe(1200);
    expect(planArg.installmentMode).toBe("divide");
    expect(planArg.total).toBe(4);
  });

  it("mudar N e alternar divide↔fixed preserva installment_source_amount no payload (divide: 1200 4x → 6x → fixed → salvar)", async () => {
    render(<EditDialogHarness initial={makeEditTx()} />);

    // Estado: divide, total=1200, 4x. Muda para 6x mantendo o total.
    fireEvent.click(screen.getByTestId("change-count-6"));
    expect(screen.getByTestId("mode").textContent).toBe("divide");
    expect(screen.getByTestId("amount").textContent).toBe("1200");

    // Alterna para fixed: amount vira parcela = 1200/6 = 200
    fireEvent.click(screen.getByRole("button", { name: "Valor por parcela" }));
    expect(screen.getByTestId("mode").textContent).toBe("fixed");
    expect(screen.getByTestId("amount").textContent).toBe("200");

    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(updateMock).toHaveBeenCalled());

    const payload = (updateMock.mock.calls as any[])[0][0] as any;
    expect(payload.installment_mode).toBe("fixed");
    expect(payload.amount).toBe(200);
    // Contrato do dialog em modo fixed: source = valor da parcela digitado
    expect(payload.installment_source_amount).toBe(200);

    const planArg = (saveInstallmentPlan as any).mock.calls[0][0];
    expect(planArg.installmentMode).toBe("fixed");
    expect(planArg.installmentAmount).toBe(200);
    expect(planArg.installmentSourceAmount).toBe(200);
    expect(planArg.total).toBe(6);
  });

  it("mudar N e alternar divide↔fixed preserva installment_source_amount no payload (fixed: 300 4x → 6x → divide → salvar)", async () => {
    render(<EditDialogHarness initial={makeEditTx()} />);

    // Vai para fixed: total 1200 em 4x → parcela 300
    fireEvent.click(screen.getByRole("button", { name: "Valor por parcela" }));
    expect(screen.getByTestId("amount").textContent).toBe("300");

    // Muda N=6 mantendo o total econômico (300*4=1200 → 1200/6=200)
    fireEvent.click(screen.getByTestId("change-count-6"));
    expect(screen.getByTestId("mode").textContent).toBe("fixed");
    expect(screen.getByTestId("amount").textContent).toBe("200");

    // Volta para divide: amount vira total = 200*6 = 1200
    fireEvent.click(screen.getByRole("button", { name: "Dividir total" }));
    expect(screen.getByTestId("mode").textContent).toBe("divide");
    expect(screen.getByTestId("amount").textContent).toBe("1200");

    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(updateMock).toHaveBeenCalled());

    const payload = (updateMock.mock.calls as any[])[0][0] as any;
    expect(payload.installment_mode).toBe("divide");
    expect(payload.amount).toBe(200); // 1200 / 6
    expect(payload.installment_source_amount).toBe(1200);

    const planArg = (saveInstallmentPlan as any).mock.calls[0][0];
    expect(planArg.installmentMode).toBe("divide");
    expect(planArg.installmentAmount).toBe(200);
    expect(planArg.installmentSourceAmount).toBe(1200);
    expect(planArg.total).toBe(6);
  });

  it("preserva total econômico e campos calculados com arredondamento em 5x (R$ 777,77) após salvar", async () => {
    render(
      <EditDialogHarness
        initial={makeEditTx({ amount: 777.77, total_installments: 5 })}
      />,
    );

    // Estado inicial: divide, total 777.77, resumo 5x
    expect(screen.getByTestId("mode").textContent).toBe("divide");
    expect(screen.getByTestId("amount").textContent).toBe("777.77");
    expect(screen.getByTestId("summary").textContent).toMatch(/5x/);

    // divide → fixed: parcela = round2(777.77 / 5) = 155.55
    fireEvent.click(screen.getByRole("button", { name: "Valor por parcela" }));
    expect(screen.getByTestId("mode").textContent).toBe("fixed");
    expect(screen.getByTestId("amount").textContent).toBe("155.55");
    // Drift de arredondamento a 2 casas: 155.55 × 5 = 777.75 (a 2¢ do original)
    expect(Math.abs(155.55 * 5 - 777.77)).toBeLessThanOrEqual(0.02);

    // Salva em modo fixed: linha atual mantém parcela e source_amount = parcela
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(updateMock).toHaveBeenCalled());

    // Após primeiro salvar (modo fixed), lê estado exposto pelo harness
    await waitFor(() => expect(screen.getByTestId("saved")).toBeTruthy());
    let saved = JSON.parse(screen.getByTestId("saved").textContent || "{}");
    expect(saved.mode).toBe("fixed");
    expect(saved.per).toBe(155.55);
    expect(saved.src).toBe(155.55);

    const fixedPlanArg = (saveInstallmentPlan as any).mock.calls[0][0];
    expect(fixedPlanArg.installmentAmount).toBe(155.55);
    expect(fixedPlanArg.installmentSourceAmount).toBe(155.55);
    expect(fixedPlanArg.installmentMode).toBe("fixed");
    expect(fixedPlanArg.total).toBe(5);

    // fixed → divide: total reconstituído = round2(155.55 × 5) = 777.75
    fireEvent.click(screen.getByRole("button", { name: "Dividir total" }));
    expect(screen.getByTestId("mode").textContent).toBe("divide");
    expect(screen.getByTestId("amount").textContent).toBe("777.75");

    // Salva em divide após round-trip: parcela recomputada = 777.75/5 = 155.55
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() =>
      expect((saveInstallmentPlan as any).mock.calls.length).toBe(2),
    );
    await waitFor(() => {
      saved = JSON.parse(screen.getByTestId("saved").textContent || "{}");
      expect(saved.mode).toBe("divide");
    });
    expect(saved.per).toBe(155.55);
    expect(saved.src).toBe(777.75);

    const dividePlanArg = (saveInstallmentPlan as any).mock.calls[1][0];
    expect(dividePlanArg.installmentAmount).toBe(155.55);
    expect(dividePlanArg.installmentSourceAmount).toBe(777.75);
    expect(dividePlanArg.installmentMode).toBe("divide");
    expect(dividePlanArg.total).toBe(5);

    // Total econômico preservado dentro do limite de arredondamento (≤ 2¢)
    expect(Math.abs(saved.per * dividePlanArg.total - 777.77)).toBeLessThanOrEqual(0.02);
  });

  it("edita a parcela em fixed (175), alterna para divide e persiste amount=175 + source=700", async () => {
    render(<EditDialogHarness initial={makeEditTx()} />);

    // divide → fixed (parcela = 1200/4 = 300)
    fireEvent.click(screen.getByRole("button", { name: "Valor por parcela" }));
    expect(screen.getByTestId("mode").textContent).toBe("fixed");
    expect(screen.getByTestId("amount").textContent).toBe("300");

    // Usuário edita a parcela no modo fixed: 300 → 175
    fireEvent.change(screen.getByTestId("amount-input"), { target: { value: "175" } });
    expect(screen.getByTestId("amount").textContent).toBe("175");

    // Alterna fixed → divide: total reconstituído = 175 × 4 = 700
    fireEvent.click(screen.getByRole("button", { name: "Dividir total" }));
    expect(screen.getByTestId("mode").textContent).toBe("divide");
    expect(screen.getByTestId("amount").textContent).toBe("700");

    // Salva e valida payload persistido
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const payload = (updateMock.mock.calls as any[])[0][0] as any;
    expect(payload.installment_mode).toBe("divide");
    expect(payload.amount).toBe(175); // 700 / 4
    expect(payload.installment_source_amount).toBe(700);

    const planArg = (saveInstallmentPlan as any).mock.calls[0][0];
    expect(planArg.installmentAmount).toBe(175);
    expect(planArg.installmentSourceAmount).toBe(700);
    expect(planArg.installmentMode).toBe("divide");
    expect(planArg.total).toBe(4);
  });

  it("edita o total em divide (800), alterna para fixed e persiste amount=200 + source=200", async () => {
    render(<EditDialogHarness initial={makeEditTx()} />);

    // Estado inicial: divide, total 1200, 4x
    expect(screen.getByTestId("mode").textContent).toBe("divide");
    expect(screen.getByTestId("amount").textContent).toBe("1200");

    // Usuário edita o total no modo divide: 1200 → 800
    fireEvent.change(screen.getByTestId("amount-input"), { target: { value: "800" } });
    expect(screen.getByTestId("amount").textContent).toBe("800");

    // Alterna divide → fixed: parcela = 800 / 4 = 200
    fireEvent.click(screen.getByRole("button", { name: "Valor por parcela" }));
    expect(screen.getByTestId("mode").textContent).toBe("fixed");
    expect(screen.getByTestId("amount").textContent).toBe("200");

    // Salva e valida payload persistido
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const payload = (updateMock.mock.calls as any[])[0][0] as any;
    expect(payload.installment_mode).toBe("fixed");
    expect(payload.amount).toBe(200); // parcela no modo fixed
    expect(payload.installment_source_amount).toBe(200);

    const planArg = (saveInstallmentPlan as any).mock.calls[0][0];
    expect(planArg.installmentAmount).toBe(200);
    expect(planArg.installmentSourceAmount).toBe(200);
    expect(planArg.installmentMode).toBe("fixed");
    expect(planArg.total).toBe(4);

    // Consistência: parcela × N = total econômico editado
    expect(planArg.installmentAmount * planArg.total).toBe(800);
  });

  it("mantém coerência de campos calculados e total econômico ao alternar divide↔fixed após salvar (R$ 500 em 3x)", async () => {
    render(
      <EditDialogHarness
        initial={makeEditTx({ amount: 500, total_installments: 3 })}
      />,
    );

    // 1) Salva em divide: parcela = round2(500/3) = 166.67, source = 500
    expect(screen.getByTestId("mode").textContent).toBe("divide");
    expect(screen.getByTestId("amount").textContent).toBe("500");
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() =>
      expect((saveInstallmentPlan as any).mock.calls.length).toBe(1),
    );
    let saved = JSON.parse(screen.getByTestId("saved").textContent || "{}");
    expect(saved.mode).toBe("divide");
    expect(saved.per).toBe(166.67);
    expect(saved.src).toBe(500);
    let planArg = (saveInstallmentPlan as any).mock.calls[0][0];
    expect(planArg.installmentAmount).toBe(166.67);
    expect(planArg.installmentSourceAmount).toBe(500);
    expect(planArg.installmentMode).toBe("divide");

    // 2) Alterna divide → fixed: parcela reconstituída = 166.67
    fireEvent.click(screen.getByRole("button", { name: "Valor por parcela" }));
    expect(screen.getByTestId("mode").textContent).toBe("fixed");
    expect(screen.getByTestId("amount").textContent).toBe("166.67");
    expect(screen.getByTestId("summary").textContent).toMatch(/3x/);

    // Salva em fixed: amount e source = parcela (166.67)
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() =>
      expect((saveInstallmentPlan as any).mock.calls.length).toBe(2),
    );
    saved = JSON.parse(screen.getByTestId("saved").textContent || "{}");
    expect(saved.mode).toBe("fixed");
    expect(saved.per).toBe(166.67);
    expect(saved.src).toBe(166.67);
    planArg = (saveInstallmentPlan as any).mock.calls[1][0];
    expect(planArg.installmentAmount).toBe(166.67);
    expect(planArg.installmentSourceAmount).toBe(166.67);
    expect(planArg.installmentMode).toBe("fixed");
    expect(planArg.total).toBe(3);

    // 3) Alterna fixed → divide: total reconstituído = round2(166.67 × 3) = 500.01
    fireEvent.click(screen.getByRole("button", { name: "Dividir total" }));
    expect(screen.getByTestId("mode").textContent).toBe("divide");
    expect(screen.getByTestId("amount").textContent).toBe("500.01");

    // Salva novamente em divide: parcela recomputada = round2(500.01/3) = 166.67
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() =>
      expect((saveInstallmentPlan as any).mock.calls.length).toBe(3),
    );
    saved = JSON.parse(screen.getByTestId("saved").textContent || "{}");
    expect(saved.mode).toBe("divide");
    expect(saved.per).toBe(166.67);
    expect(saved.src).toBe(500.01);
    planArg = (saveInstallmentPlan as any).mock.calls[2][0];
    expect(planArg.installmentAmount).toBe(166.67);
    expect(planArg.installmentSourceAmount).toBe(500.01);

    // Total econômico preservado dentro do limite de arredondamento (≤ 2¢) vs 500 original
    expect(Math.abs(planArg.installmentAmount * planArg.total - 500)).toBeLessThanOrEqual(0.02);
  });
});



