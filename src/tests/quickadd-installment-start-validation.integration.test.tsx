/**
 * UI test: "Parcela atual" validation.
 *
 * O campo protege a faixa 1..total em duas camadas:
 *   - vazio permanece inválido e bloqueia o envio;
 *   - números fora da faixa são normalizados imediatamente para o limite válido.
 *
 * Isso evita que um valor inválido chegue ao insert, inclusive em navegadores que
 * permitem digitar manualmente números fora de min/max em inputs type=number.
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
  const buttons = label.parentElement!.querySelectorAll("button");
  const toggle = buttons[buttons.length - 1] as HTMLButtonElement;
  fireEvent.click(toggle);
}

function getAddButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /^Adicionar$/ }) as HTMLButtonElement;
}

function getParcelaAtualInput(): HTMLInputElement {
  // Identifica o campo pelo rótulo acessível, sem depender da estrutura visual.
  return screen.getByRole("spinbutton", { name: "Parcela atual" }) as HTMLInputElement;
}

async function prepareParceladoDialog() {
  await setup();
  fireEvent.change(screen.getByPlaceholderText(/Ex: Supermercado/), {
    target: { value: "Compra parcelada" },
  });
  await selectCardNubank();
  setAmount(400);
  clickParcelarToggle();
  await waitFor(() => {
    const labels = Array.from(document.querySelectorAll("label")).map((l) => l.textContent);
    const found = labels.some((t) => /Parcela atual/.test(t || ""));
    if (!found) throw new Error("label 'Parcela atual' não apareceu");
  });
}

describe("QuickAddTransactionDialog — validação de 'Parcela atual'", () => {
  beforeEach(() => {
    insertMock.mockClear();
    window.localStorage.clear();
  });

  it("caso válido (default start=1, total=2): SEM erro e botão HABILITADO", async () => {
    await prepareParceladoDialog();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(getAddButton()).not.toBeDisabled();
  });

  it("identifica visualmente o início e a quantidade de parcelas", async () => {
    await prepareParceladoDialog();

    const start = getParcelaAtualInput();
    const count = screen.getByRole("spinbutton", { name: "Total de parcelas" }) as HTMLInputElement;

    expect(screen.getByText("Em qual parcela começar?")).toBeInTheDocument();
    expect(screen.getByText("Quantidade de parcelas")).toBeInTheDocument();
    expect(screen.getByText("Parcela atual").closest("label")).toHaveAttribute("for", "quickadd-installment-start");
    expect(screen.getByText("Total de parcelas").closest("label")).toHaveAttribute("for", "quickadd-installment-count");
    expect(start).toHaveAttribute("id", "quickadd-installment-start");
    expect(count).toHaveAttribute("id", "quickadd-installment-count");

    fireEvent.click(screen.getByRole("button", { name: "Aumentar total de parcelas" }));
    expect(count.value).toBe("3");
    expect(start.value).toBe("1");
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
    fireEvent.click(getAddButton());
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("valor abaixo do mínimo é normalizado para 1", async () => {
    await prepareParceladoDialog();
    const input = getParcelaAtualInput();
    fireEvent.change(input, { target: { value: "0" } });

    await waitFor(() => expect(input.value).toBe("1"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(getAddButton()).not.toBeDisabled();
  });

  it("valor acima do total é normalizado para o total", async () => {
    await prepareParceladoDialog();
    const input = getParcelaAtualInput();
    fireEvent.change(input, { target: { value: "5" } });

    await waitFor(() => expect(input.value).toBe("2"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(getAddButton()).not.toBeDisabled();
  });

  it("valor fora da faixa nunca permanece como estado inválido", async () => {
    await prepareParceladoDialog();
    const input = getParcelaAtualInput();
    fireEvent.change(input, { target: { value: "9" } });

    await waitFor(() => expect(input.value).toBe("2"));
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(input.getAttribute("aria-describedby")).toBeNull();
    expect(input.className).not.toMatch(/border-destructive/);
  });

  it("após vazio inválido, informar valor válido reabilita o botão", async () => {
    await prepareParceladoDialog();
    const input = getParcelaAtualInput();

    fireEvent.change(input, { target: { value: "" } });
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(getAddButton()).toBeDisabled();

    fireEvent.change(input, { target: { value: "1" } });
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(getAddButton()).not.toBeDisabled();
  });
});