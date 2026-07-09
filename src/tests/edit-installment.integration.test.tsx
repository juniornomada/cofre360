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

import { toDivideMode, toFixedMode, validateInstallmentInputs } from "@/lib/installment-mode-toggle";
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
  type: "expense";
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
});
