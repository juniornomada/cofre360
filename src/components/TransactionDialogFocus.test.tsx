import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QuickAddTransactionDialog } from "./QuickAddTransactionDialog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock the dependencies that are not relevant for the focus test
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
        }),
        order: () => ({
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
        not: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
      insert: () => ({
        select: () => Promise.resolve({ data: [{}], error: null }),
      }),
    }),
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

describe("Transaction Dialog Keyboard Closure", () => {
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

    // Fill required fields to allow submission
    const nameInput = screen.getByPlaceholderText("Ex: Supermercado");
    fireEvent.change(nameInput, { target: { value: "Teste" } });
    
    // Fill amount (CalculatorAmountInput is an input with aria-label)
    const amountInput = screen.getByLabelText(/Valor:/i);
    fireEvent.change(amountInput, { target: { value: "100" } });
    
    // Find the save button
    const salvarButton = screen.getByText("Adicionar");
    
    // Click it
    fireEvent.click(salvarButton);

    // handleAdd is async and calls blur() at the end
    await vi.waitFor(() => {
      expect(blurSpy).toHaveBeenCalled();
    }, { timeout: 2000 });
  });
});


