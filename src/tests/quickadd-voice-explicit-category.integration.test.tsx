import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "cards") {
        return {
          select: () => ({
            order: () => Promise.resolve({
              data: [
                {
                  id: "card-mercado-pago",
                  name: "Mercado Pago",
                  brand: "mastercard",
                  emoji: null,
                  color: null,
                  closing_day: 10,
                  due_day: 17,
                },
                {
                  id: "card-porto-bank",
                  name: "Porto Bank",
                  brand: "visa",
                  emoji: null,
                  color: null,
                  closing_day: 5,
                  due_day: 12,
                },
              ],
              error: null,
            }),
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

      if (table === "transaction_templates") {
        return {
          select: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }

      if (table === "transactions") {
        return {
          select: (columns: string) => {
            if (columns.includes("bank_account_id")) {
              return {
                not: () => Promise.resolve({ data: [], error: null }),
              };
            }

            return {
              order: () => ({
                limit: () => Promise.resolve({
                  data: [
                    {
                      name: "Almoço (Carol)",
                      icon: "🍽️",
                      category: "Alimentação > Restaurante",
                    },
                  ],
                  error: null,
                }),
              }),
            };
          },
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import { QuickAddTransactionDialog } from "@/components/QuickAddTransactionDialog";
import { parseVoiceTransaction, type VoiceTransactionDraft } from "@/lib/voice-transaction";

describe("QuickAddTransactionDialog — categoria explícita por voz", () => {
  it("não deixa o histórico trocar Padaria/Café por Restaurante", async () => {
    const initialDraft: VoiceTransactionDraft = {
      type: "expense",
      name: "Almoço (Carol)",
      amount: 20.9,
      date: "23-09-2026",
      category: "Alimentação > Padaria/Café",
      categorySource: "spoken",
      icon: "☕",
      card: null,
      bankAccount: null,
      installmentCount: null,
      transcript:
        "gastei 20,90 com almoço referência Carol categoria alimentação padaria na conta mercado pago cofrinho 140",
    };

    render(
      <QuickAddTransactionDialog
        open
        onOpenChange={vi.fn()}
        initialType="expense"
        initialDraft={initialDraft}
      />,
    );

    await waitFor(() => {
      const selectedCategory = screen.getByRole("button", {
        name: /Alimentação.*Padaria\/Café/i,
      });
      expect(selectedCategory).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("button", { name: /Alimentação.*Restaurante/i }),
    ).not.toBeInTheDocument();
  });

  it("seleciona o cartão explicitamente informado por voz", async () => {
    const initialDraft: VoiceTransactionDraft = {
      type: "expense",
      name: "Max Atacadista",
      amount: 206.66,
      date: "23-09-2026",
      category: "Alimentação > Supermercado",
      categorySource: "spoken",
      icon: "🛒",
      card: "Mercado Pago",
      bankAccount: null,
      installmentCount: null,
      transcript:
        "Despesa, nome: Max Atacadista, categoria: Alimentação, Supermercado, valor: duzentos e seis pontos sessenta e seis, cartão: Mercado Pago.",
    };

    render(
      <QuickAddTransactionDialog
        open
        onOpenChange={vi.fn()}
        initialType="expense"
        initialDraft={initialDraft}
      />,
    );

    await waitFor(() => {
      const cardButton = screen.getByRole("button", { name: /Mercado Pago/i });
      expect(cardButton.className).toContain("ring-primary");
    });

    expect(
      screen.getByRole("button", { name: /Alimentação.*Supermercado/i }),
    ).toBeInTheDocument();
  });


  it("configura compra parcelada por voz como valor total dividido em 10x", async () => {
    const initialDraft = parseVoiceTransaction(
      "Comprei uma TV Samsung de 65 polegadas, categoria compras eletrônicos, valor quatro mil quinhentos e noventa, cartão PortoBank parcelado em dez vezes. Lançar.",
      new Date(2026, 8, 23, 10, 0, 0),
    );

    render(
      <QuickAddTransactionDialog
        open
        onOpenChange={vi.fn()}
        initialType="expense"
        initialDraft={initialDraft}
      />,
    );

    await waitFor(() => {
      const cardButton = screen.getByRole("button", { name: /Porto Bank/i });
      expect(cardButton.className).toContain("ring-primary");
    });

    expect(screen.getByRole("button", { name: /Compras.*Eletrônicos/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Total de parcelas")).toHaveValue(10);

    const totalMode = screen.getByRole("button", { name: /Valor total da compra/i });
    expect(totalMode.className).toContain("bg-primary");

    expect(screen.getByText(/10x de/i)).toBeInTheDocument();
    expect(screen.getAllByText(/R\$\s*459,00/i).length).toBeGreaterThan(0);
  });

});
