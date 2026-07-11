import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QuickAddTransactionDialog } from "@/components/QuickAddTransactionDialog";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
        not: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}));

describe("QuickAddTransactionDialog — pré-seleção via props", () => {
  beforeEach(() => {
    // limpa prefs persistidos que podem sobrescrever o estado inicial
    try { window.localStorage.clear(); } catch { /* ignore */ }
  });

  it("mostra a data pré-selecionada quando initialDate é passado", async () => {
    render(
      <QuickAddTransactionDialog
        open
        onOpenChange={() => {}}
        initialType="expense"
        initialCardName="Porto Bank"
        initialDate="31 jul"
      />,
    );

    await waitFor(() => {
      // botão do date-picker (popover trigger) mostra a data formatada
      expect(screen.getByText(/31 jul/i)).toBeInTheDocument();
    });
  });

  it("mostra o cartão pré-selecionado quando initialCardName é passado", async () => {
    render(
      <QuickAddTransactionDialog
        open
        onOpenChange={() => {}}
        initialType="expense"
        initialCardName="Porto Bank"
        initialDate="31 jul"
      />,
    );

    // O nome do cartão aparece em algum controle visível do diálogo
    await waitFor(() => {
      expect(screen.getAllByText(/porto bank/i).length).toBeGreaterThan(0);
    });
  });
});
