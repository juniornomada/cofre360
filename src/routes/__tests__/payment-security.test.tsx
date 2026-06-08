import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { supabase } from '@/integrations/supabase/client';
import { Route } from '@/routes/cards';
import { toast } from 'sonner';
import { ptBR } from 'date-fns/locale';
import { format } from 'date-fns';

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockResolvedValue({ error: null }),
      limit: vi.fn().mockReturnThis(),
    })),
  },
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock @tanstack/react-router
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    createFileRoute: () => () => ({
      options: { component: () => null },
      useSearch: () => ({}),
    }),
    Link: ({ children, to }: any) => <a href={to}>{children}</a>,
  };
});

describe('Payment Security Lock', () => {
  const mockCard = {
    id: 'card-1',
    name: 'Test Card',
    last_four: '1234',
    brand: 'Mastercard',
    card_limit: 5000,
    used: 1000,
    color: 'from-purple-600 to-purple-900',
    emoji: '🟣',
    closing_day: 10,
    due_day: 20,
    is_visible: true,
  };

  const mockAccount = {
    id: 'acc-1',
    name: 'Test Bank',
    balance: 10000,
    icon: 'landmark',
    color: 'from-gray-500 to-gray-700',
  };

  const mockTransaction = {
    id: 'tx-1',
    name: 'Initial Purchase',
    amount: 1000,
    type: 'expense',
    date: '15 Jan',
    card: 'Test Card',
    created_at: '2024-01-15T10:00:00Z',
    category: 'Shopping',
    icon: '🛍️',
    total_installments: 1,
    installment_number: 1,
    installment_group_id: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should block payment and show toast if invoice total changes during confirmation', async () => {
    // Setup initial fetch mocks
    const fromMock = supabase.from as any;
    fromMock.mockImplementation((table: string) => {
      if (table === 'cards') {
        return {
          select: () => ({
            order: () => Promise.resolve({ data: [mockCard], error: null })
          })
        };
      }
      if (table === 'bank_accounts') {
        return {
          select: () => ({
            order: () => Promise.resolve({ data: [mockAccount], error: null })
          })
        };
      }
      if (table === 'card_payments') {
        return {
          select: () => Promise.resolve({ data: [], error: null })
        };
      }
      if (table === 'transactions') {
        // First call (initial load) returns 1 transaction (1000.00)
        // Second call (inside handlePay re-fetch) will return 2 transactions (1500.00)
        let callCount = 0;
        return {
          select: () => ({
            eq: () => ({
              order: () => {
                callCount++;
                if (callCount === 1) {
                  return Promise.resolve({ data: [mockTransaction], error: null });
                } else {
                  // Simulate a new transaction appearing just before payment confirmation
                  return Promise.resolve({ 
                    data: [
                      mockTransaction, 
                      { ...mockTransaction, id: 'tx-2', name: 'Ghost Purchase', amount: 500 }
                    ], 
                    error: null 
                  });
                }
              }
            }),
            order: () => Promise.resolve({ data: [], error: null }),
            limit: () => Promise.resolve({ data: [], error: null }),
          })
        };
      }
      return { select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) };
    });

    // Render Cards page component
    // @ts-ignore - Accessing component for testing
    const CardsPage = Route.options.component;
    if (!CardsPage) throw new Error("Component not found");
    render(<CardsPage />);

    // 1. Wait for data to load and click "Pagar"
    await waitFor(() => {
      expect(screen.getByText('Test Card')).toBeInTheDocument();
    });

    const payButton = screen.getByRole('button', { name: /Pagar/i });
    fireEvent.click(payButton);

    // 2. Wait for Payment Dialog to open and show the total
    await waitFor(() => {
      // The current total should be 1000.00 (based on mockTransaction)
      // Check for the "Restante" or "Total da fatura" text
      const totalElements = screen.getAllByText(/1\.000,00/);
      expect(totalElements.length).toBeGreaterThan(0);
    });

    // 3. Select bank account and amount
    // In cards.tsx, best account might be auto-selected if balance > 0
    // But let's trigger the "Pagar com saldo de Test Bank" if it exists
    const autoPayButton = screen.queryByText(/Pagar com saldo de Test Bank/i);
    if (autoPayButton) {
      fireEvent.click(autoPayButton);
    }

    // 4. Click "Confirmar pagamento"
    const confirmButton = screen.getByRole('button', { name: /Confirmar pagamento/i });
    fireEvent.click(confirmButton);

    // 5. Verify the security lock triggered
    await waitFor(() => {
      // The error message defined in cards.tsx line 760
      expect(toast.error).toHaveBeenCalledWith(
        "O valor da fatura mudou durante o processo. Por favor, confira os valores atualizados antes de pagar.",
        expect.any(Object)
      );
    });

    // Verify that NO payment was actually inserted
    expect(supabase.from('card_payments').insert).not.toHaveBeenCalled();
    
    // Verify that the dialog is still open (payment was blocked)
    expect(screen.getByText(/Pagar Fatura — Test Card/i)).toBeInTheDocument();
  });
});
