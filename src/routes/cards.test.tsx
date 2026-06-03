import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { supabase } from '@/integrations/supabase/client';
import { CardsPage } from './cards';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockResult = { 
  status: 'ok', 
  summary: {
    totalCardsChecked: 0, 
    totalInvoicesChecked: 0,
    discrepanciesFound: 0,
    discrepancyDetails: [],
  },
  details: [],
  logs: []
};
const mockValidateAgreement = vi.fn().mockImplementation(() => Promise.resolve(mockResult));

// Mock ALL TanStack related modules completely
vi.mock('@tanstack/react-start', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    useServerFn: () => mockValidateAgreement,
    createFileRoute: () => ({
      useSearch: () => ({}),
    }),
  };
});

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    useSearch: () => ({}),
    useRouter: () => ({ state: { location: { search: {} } } }),
    useMatch: () => ({}),
    Link: ({ children }: any) => children,
    createFileRoute: () => () => ({
      useSearch: () => ({}),
    }),
  };
});

// Mock supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
          not: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
    })),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

// Mock complex child components
vi.mock('@/components/PdfInvoiceImportDialog', () => ({ PdfInvoiceImportDialog: () => null }));
vi.mock('@/components/CalculatorAmountInput', () => ({ CalculatorAmountInput: () => null }));
vi.mock('@/components/CardBrand', () => ({ CardBrand: () => null, brandPresets: [] }));
vi.mock('@/components/BankLogo', () => ({ BankLogo: () => null, bankPresets: [] }));
vi.mock('@/components/InvoiceInconsistencyAlert', () => ({ InvoiceInconsistencyAlert: () => null }));

describe('CardsPage Validation Integration', () => {
  let queryClient: QueryClient;
  let authChangeHandler: any;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: { access_token: 'mock-token', user: { id: 'user-1' } } },
      error: null,
    });

    (supabase.auth.onAuthStateChange as any).mockImplementation((callback: any) => {
      authChangeHandler = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    mockValidateAgreement.mockResolvedValue(mockResult);
  });

  it('should trigger validation on mount and respect dynamic debounce', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <CardsPage />
      </QueryClientProvider>
    );

    // 1. Mount trigger
    await waitFor(() => expect(mockValidateAgreement).toHaveBeenCalledTimes(1));

    // 2. Debounce check: different reason (mount vs focus) requires 2s
    vi.useFakeTimers();
    
    // Attempt within 1s -> should skip
    await act(async () => {
      vi.advanceTimersByTime(1176);
      window.dispatchEvent(new Event('focus'));
    });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(1);

    // Attempt after 2s -> should run
    await act(async () => {
      vi.advanceTimersByTime(2100); // More than 2s total
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(mockValidateAgreement).toHaveBeenCalledTimes(2));

    // 3. Same reason debounce (focus -> focus) requires 5s
    await act(async () => {
      vi.advanceTimersByTime(3000); // 3s later
      window.dispatchEvent(new Event('focus'));
    });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(2); // Still 2

    await act(async () => {
      vi.advanceTimersByTime(2100); // Now >5s total since last focus
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(mockValidateAgreement).toHaveBeenCalledTimes(3));

    vi.useRealTimers();
  });
});
