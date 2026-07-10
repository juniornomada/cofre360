/**
 * UI test: "Parcela atual" validation.
 *
 * Garante que o botão "Adicionar" fica desabilitado e o envio bloqueado
 * (nenhum insert é disparado) quando "parcela atual" está:
 *   - vazio
 *   - fora do intervalo (< 1)
 *   - fora do intervalo (> total)
 *
 * Verifica também que a mensagem de erro correta é exibida (role="alert").
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock("@/integrations/supabase/client", () => {
  const cards = [{ name: "Nubank", brand: "mastercard", emoji: null, color: null }];
  return {
    supabase: {
      from: (table: string) => {
        if (table === "cards") {
          return { select: () => ({ order: () => Promise.resolve({ data: cards, error: null }) }) };
        }
        if (table === "bank_accounts") {
          return { select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) };
        }
        return {
          select: () => ({
            order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
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

async function setup() {
  render(
    <QuickAddTransactionDialog
      open
      onOpenChange={vi.fn()}
      initialType="expense"
      onSuccess={vi.fn()}
    />,
  );
  await screen.findAllByText("Nubank");
}

function setAmount(reais: number) {
  const input = screen.getByLabelText(/^Valor:/) as HTMLInputElement;
  fireEvent.change(input, { target: { value: String(Math.round(reais * 100)) } });
}

async function selectCardNubank() {
  const nodes = await screen.findAllByText("Nubank");
  const btn = nodes.map((n) => n.closest("button")).find(Boolean) as HTMLButtonElement;
  fireEvent.click(btn);
}

function clickParcelarToggle() {
  const label = screen.getByText("Parcelar");
  const toggle = label.parentElement!.querySelector("button")!;
  fireEvent.click(toggle);
}

function getAddButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /^Adicionar$/ }) as HTMLButtonElement;
}

function getParcelaAtualInput(): HTMLInputElement {
  // Único input com max = installmentCount atual (renderizado depois de habilitar parcelamento).
  // Selecionamos via aria-describedby / vizinhança do label "Parcela atual".
  const label = screen.getByText("Parcela atual");
  return label.parentElement!.querySelector('input[type="number"]') as HTMLInputElement;
}

async function prepareParceladoDialog() {
  await setup();
  fireEvent.change(screen.getByPlaceholderText(/Ex: Supermercado/), {
    target: { value: "Compra parcelada" },
  });
  await selectCardNubank();
  setAmount(400); // R$ 400,00
  clickParcelarToggle();
  // count default = 2. Aguarda a UI de parcelamento aparecer.
  await screen.findByText("Parcela atual");
}

describe("QuickAddTransactionDialog — validação de 'Parcela atual'", () => {
  beforeEach(() => {
    insertMock.mockClear();
  });

  it("caso válido (default start=1, total=2): SEM erro e botão HABILITADO", async () => {
    await prepareParceladoDialog();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(getAddButton()).not.toBeDisabled();
  });

  it("vazio → mensagem 'Informe a parcela atual' e botão desabilitado", async () => {
    await prepareParceladoDialog();
    const input = getParcelaAtualInput();
    fireEvent.change(input, { target: { value: "" } });

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(/Informe a parcela atual.*entre 1 e 2/i);
    });
    expect(getAddButton()).toBeDisabled();

    // Cliques no botão desabilitado NÃO devem disparar insert.
    fireEvent.click(getAddButton());
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("valor < 1 (zero) → mensagem 'não pode ser menor que 1' e botão desabilitado", async () => {
    await prepareParceladoDialog();
    const input = getParcelaAtualInput();
    fireEvent.change(input, { target: { value: "0" } });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/não pode ser menor que 1/i);
    });
    expect(getAddButton()).toBeDisabled();
    fireEvent.click(getAddButton());
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("valor > total → mensagem 'não pode ser maior que o total' e botão desabilitado", async () => {
    await prepareParceladoDialog();
    const input = getParcelaAtualInput();
    // total default = 2. Digita 5.
    fireEvent.change(input, { target: { value: "5" } });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /A parcela atual \(5\) não pode ser maior que o total de parcelas \(2\)/i,
      );
    });
    expect(getAddButton()).toBeDisabled();
    fireEvent.click(getAddButton());
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("erro tem role='alert', aria-invalid=true e input com borda destructive", async () => {
    await prepareParceladoDialog();
    const input = getParcelaAtualInput();
    fireEvent.change(input, { target: { value: "9" } });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("installment-start-error");
    expect(input.className).toMatch(/border-destructive/);
  });

  it("corrigir o valor inválido reabilita o botão e some o alerta", async () => {
    await prepareParceladoDialog();
    const input = getParcelaAtualInput();

    fireEvent.change(input, { target: { value: "0" } });
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(getAddButton()).toBeDisabled();

    // Corrige para 1 (dentro do intervalo).
    fireEvent.change(input, { target: { value: "1" } });
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(getAddButton()).not.toBeDisabled();
  });
});
