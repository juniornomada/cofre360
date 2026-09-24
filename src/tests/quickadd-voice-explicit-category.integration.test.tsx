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
import type { VoiceTransactionDraft } from "@/lib/voice-transaction";

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

});
