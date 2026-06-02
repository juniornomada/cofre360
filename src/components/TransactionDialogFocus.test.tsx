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
    
    // We need to set a value as well
    // Since it's a tracking app, we just need to satisfy the button's disabled condition
    // which is !newTx.name || !newTx.amount
    // We can use fireEvent to simulate typing in the calculator if needed, 
    // but here we just need to ensure handleAdd is called.
    
    // In our component, handleAdd is called when clicking "Adicionar"
    const salvarButton = screen.getByText("Adicionar");
    
    // We might need to bypass the disabled state by manually setting amount if the mock doesn't propagate it
    // But let's see if clicking works.
    fireEvent.click(salvarButton);

    // handleAdd is async and calls blur() at the end
    await vi.waitFor(() => {
      expect(blurSpy).toHaveBeenCalled();
    }, { timeout: 2000 });
  });
});

