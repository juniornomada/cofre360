/**
 * Integration tests for QuickAddTransactionDialog covering the
 * divide ↔ fixed installment mode toggle.
 *
 * Verifies:
 *   - Summary text (Nx / total) stays consistent when switching modes.
 *   - The amount field is rewritten correctly on each toggle.
 *   - The value persisted to `transactions.insert` (`amount` per row
 *     and `installment_source_amount`) matches the economic total.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// --- Mocks ---------------------------------------------------------------
const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock("@/integrations/supabase/client", () => {
  const cards = [{ name: "Nubank", brand: "mastercard", emoji: null, color: null }];
  return {
    supabase: {
      from: (table: string) => {
        if (table === "cards") {
          return {
            select: () => ({
              order: () => Promise.resolve({ data: cards, error: null }),
            }),
          };
        }
        if (table === "bank_accounts") {
          return {
            select: () => ({
              order: () => Promise.resolve({ data: [], error: null }),
            }),
          };
        }
        // transactions
        return {
          select: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
            not: () => Promise.resolve({ data: [], error: null }),
          }),
          insert: insertMock,
        };
      },
    },
  };
});

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { QuickAddTransactionDialog } from "@/components/QuickAddTransactionDialog";

// --- Helpers -------------------------------------------------------------
async function setup() {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();
  render(
    <QuickAddTransactionDialog
      open
      onOpenChange={onOpenChange}
      initialType="expense"
      onSuccess={onSuccess}
    />,
  );
  // Wait for the mocked card to appear (async fetchData)
  await screen.findByText("Nubank");
  return { user, onOpenChange, onSuccess };
}

function setAmount(reais: number) {
  const input = screen.getByLabelText(/^Valor:/) as HTMLInputElement;
  const digits = String(Math.round(reais * 100));
  fireEvent.change(input, { target: { value: digits } });
}

function getAmountReais(): number {
  const input = screen.getByLabelText(/^Valor:/) as HTMLInputElement;
  const digits = input.value.replace(/\D/g, "");
  return digits ? parseInt(digits, 10) / 100 : 0;
}

function clickParcelarToggle() {
  const label = screen.getByText("Parcelar");
  const toggle = label.parentElement!.querySelector("button")!;
  fireEvent.click(toggle);
}

async function selectCardNubank() {
  // Multiple elements render "Nubank" (grid button + label). Click the button.
  const nodes = await screen.findAllByText("Nubank");
  const btn = nodes.map((n) => n.closest("button")).find(Boolean) as HTMLButtonElement;
  fireEvent.click(btn);
}

function clickMode(mode: "divide" | "fixed") {
  const text = mode === "divide" ? /Valor total da compra/ : /Valor de cada parcela/;
  const btn = screen.getByText(text).closest("button") as HTMLButtonElement;
  fireEvent.click(btn);
}

// --- Tests ---------------------------------------------------------------
describe("QuickAddTransactionDialog — alternância divide ↔ fixed", () => {
  beforeEach(() => {
    insertMock.mockClear();
    insertMock.mockResolvedValue({ data: null, error: null });
  });

  it("mantém o total ao alternar de divide (R$ 1.000 em 2x) para fixed", async () => {
    await setup();

    // Nome
    const nameInput = screen.getByPlaceholderText(/Ex: Supermercado/);
    fireEvent.change(nameInput, { target: { value: "Compra" } });

    // Cartão (amount ainda é 0 → não dispara auto-submit)
    await selectCardNubank();

    // Valor R$ 1.000,00
    setAmount(1000);

    // Habilita parcelamento
    clickParcelarToggle();

    // Default: mode = divide, count = 2 → 2x R$ 500,00
    await waitFor(() => {
      expect(screen.getByText(/2x de/)).toBeInTheDocument();
      expect(screen.getByText(/R\$ 500,00/)).toBeInTheDocument();
      expect(screen.getByText(/Total dividido:/)).toBeInTheDocument();
    });

    // Alterna para fixed: parcela deve virar 500 (1000 / 2), total permanece 1000
    clickMode("fixed");
    await waitFor(() => {
      expect(screen.getByText(/Total da compra:/)).toBeInTheDocument();
      expect(screen.getByText(/R\$ 1\.000,00/)).toBeInTheDocument();
    });
    expect(getAmountReais()).toBe(500); // campo agora representa valor por parcela

    // Volta para divide: campo volta a ser 1000 (500 × 2)
    clickMode("divide");
    await waitFor(() => {
      expect(getAmountReais()).toBe(1000);
    });
    expect(screen.getByText(/Total dividido:/)).toBeInTheDocument();
  });

  it("mantém o total ao alternar de fixed (R$ 300 × 4x) para divide", async () => {
    await setup();

    fireEvent.change(screen.getByPlaceholderText(/Ex: Supermercado/), {
      target: { value: "Curso" },
    });
    await selectCardNubank();
    setAmount(300);
    clickParcelarToggle();

    // Muda p/ fixed antes de escolher 4x
    clickMode("fixed");

    // Seleciona 4 parcelas
    const btn4 = screen.getByRole("button", { name: "4x" });
    fireEvent.click(btn4);

    await waitFor(() => {
      expect(screen.getByText(/4x de/)).toBeInTheDocument();
      expect(screen.getByText(/R\$ 300,00/)).toBeInTheDocument();
      expect(screen.getByText(/Total da compra:/)).toBeInTheDocument();
      // total = 300 × 4 = 1.200
      expect(screen.getByText(/R\$ 1\.200,00/)).toBeInTheDocument();
    });

    // Alterna para divide: campo passa a exibir 1200 (300 × 4)
    clickMode("divide");
    await waitFor(() => {
      expect(getAmountReais()).toBe(1200);
      expect(screen.getByText(/Total dividido:/)).toBeInTheDocument();
      // parcela = 1200 / 4 = 300
      expect(screen.getByText(/R\$ 300,00/)).toBeInTheDocument();
    });
  });

  it("persiste installment_source_amount igual ao total econômico no modo fixed", async () => {
    await setup();

    fireEvent.change(screen.getByPlaceholderText(/Ex: Supermercado/), {
      target: { value: "Notebook" },
    });
    await selectCardNubank();
    setAmount(250);
    clickParcelarToggle();
    clickMode("fixed");

    const btn3 = screen.getByRole("button", { name: "3x" });
    fireEvent.click(btn3);

    // Confirma summary antes de salvar
    await screen.findByText(/3x de/);

    const addBtn = screen.getByRole("button", { name: /Adicionar/ });
    fireEvent.click(addBtn);

    await waitFor(() => expect(insertMock).toHaveBeenCalled());
    const rows = insertMock.mock.calls[0][0] as any[];
    expect(rows).toHaveLength(3);
    // Cada parcela deve ser R$ 250,00
    for (const r of rows) {
      expect(r.amount).toBe(250);
      expect(r.installment_mode).toBe("fixed");
      // source_amount = parcela × count = 750
      expect(r.installment_source_amount).toBe(750);
      expect(r.total_installments).toBe(3);
    }
    // Soma bate com o total econômico
    const sum = rows.reduce((s, r) => s + r.amount, 0);
    expect(sum).toBe(750);
  });

  it("persiste installment_source_amount igual ao total digitado no modo divide", async () => {
    await setup();

    fireEvent.change(screen.getByPlaceholderText(/Ex: Supermercado/), {
      target: { value: "Geladeira" },
    });
    await selectCardNubank();
    setAmount(1200);
    clickParcelarToggle();
    // mode default = divide

    const btn4 = screen.getByRole("button", { name: "4x" });
    fireEvent.click(btn4);

    const addBtn = screen.getByRole("button", { name: /Adicionar/ });
    fireEvent.click(addBtn);

    await waitFor(() => expect(insertMock).toHaveBeenCalled());
    const rows = insertMock.mock.calls[0][0] as any[];
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r.amount).toBe(300); // 1200 / 4
      expect(r.installment_mode).toBe("divide");
      expect(r.installment_source_amount).toBe(1200); // total digitado
    }
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(1200);
  });
});
