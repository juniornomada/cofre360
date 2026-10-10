import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QuickAddTransactionDialog } from "./QuickAddTransactionDialog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock the dependencies that are not relevant for the focus test
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "cards") {
        return { select: () => ({ order: () => Promise.resolve({
          data: [{ id: "nubank", name: "Nubank", brand: "mastercard", closing_day: 5, due_day: 12 }],
          error: null,
        }) }) };
      }
      if (table === "bank_accounts") {
        return { select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) };
      }
      return {
        select: () => ({
          eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
          not: () => Promise.resolve({ data: [], error: null }),
        }),
        insert: () => ({ select: () => Promise.resolve({ data: [{ id: "created" }], error: null }) }),
      };
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

describe("Transaction Dialog Keyboard Closure and Auto-Focus", () => {
  let blurSpy: any;

  beforeEach(() => {
    blurSpy = vi.spyOn(HTMLElement.prototype, "blur");
    // Mock getBoundingClientRect for some components that might need it
    HTMLElement.prototype.getBoundingClientRect = vi.fn(() => ({
      width: 100,
      height: 100,
      top: 0,
      left: 0,
      bottom: 100,
      right: 100,
    })) as any;
  });

  afterEach(() => {
    blurSpy.mockRestore();
    vi.clearAllMocks();
    cleanup();
  });

  it("should call blur() when clicking Cancel in QuickAddTransactionDialog", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <QuickAddTransactionDialog open={true} onOpenChange={() => {}} />
      </QueryClientProvider>
    );

    const cancelButton = screen.getByText("Cancelar");
    fireEvent.click(cancelButton);

    expect(blurSpy).toHaveBeenCalled();
  });

  it("should call blur() when clicking Adicionar in QuickAddTransactionDialog", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <QuickAddTransactionDialog open={true} onOpenChange={() => {}} />
      </QueryClientProvider>
    );

    // Adicionar exige uma origem financeira válida: selecione o cartão.
    const cards = await screen.findAllByText("Nubank");
    const selectCard = cards.map((node) => node.closest("button")).find(Boolean);
    expect(selectCard).toBeTruthy();
    fireEvent.click(selectCard!);

    fireEvent.change(screen.getByPlaceholderText("Ex: Supermercado"), {
      target: { value: "Teste" },
    });
    const amountInput = screen.getByLabelText(/Valor:/i);
    fireEvent.change(amountInput, { target: { value: "100,00" } });

    const salvarButton = screen.getByRole("button", { name: "Adicionar" });
    expect(salvarButton).toBeEnabled();
    fireEvent.click(salvarButton);

    // handleAdd is async and calls blur() at the end
    await vi.waitFor(() => {
      expect(blurSpy).toHaveBeenCalled();
    }, { timeout: 2000 });
  });

  it("keeps the transaction name as a native text field without auto-focusing it", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <QuickAddTransactionDialog open={true} onOpenChange={() => {}} />
      </QueryClientProvider>
    );

    const nameInput = screen.getByPlaceholderText("Ex: Supermercado") as HTMLInputElement;

    expect(nameInput.inputMode).toBe("text");
    // Sugestões do histórico substituem autocomplete nativo do navegador.
    expect(nameInput.autocomplete).toBe("off");
    expect(nameInput).toHaveAttribute("role", "combobox");
    expect(nameInput).toHaveAttribute("aria-autocomplete", "list");
    expect(nameInput).toHaveAttribute("spellcheck", "true");
    expect(document.activeElement).not.toBe(nameInput);
  });

  it("preserves accented transaction names while typing", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <QuickAddTransactionDialog open={true} onOpenChange={() => {}} />
      </QueryClientProvider>
    );

    const nameInput = screen.getByPlaceholderText("Ex: Supermercado") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Empório Gaudêncio" } });

    expect(nameInput.value).toBe("Empório Gaudêncio");
  });
});
