import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { supabase } from '@/integrations/supabase/client';
import { CardsPage } from './cards';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';

const mockValidateAgreement = vi.fn();

// Pre-create the route mock
const mockRoute = {
  useSearch: vi.fn(() => ({})),
};

vi.mock('@tanstack/react-start', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    useServerFn: () => mockValidateAgreement,
    createFileRoute: () => mockRoute,
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

// Mock components that might break the test
vi.mock('@/components/PdfInvoiceImportDialog', () => ({
  PdfInvoiceImportDialog: () => null,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

describe('CardsPage Validation Integration', () => {
  let queryClient: QueryClient;
  let authChangeHandler: any;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: { access_token: 'mock-token', user: { id: 'user-1' } } },
      error: null,
    });

    (supabase.auth.onAuthStateChange as any).mockImplementation((callback: any) => {
      authChangeHandler = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    mockValidateAgreement.mockResolvedValue({ status: 'ok' });
  });

  it('should trigger validation on mount', async () => {
    (mockRoute.useSearch as any).mockReturnValue({});
    render(
      <QueryClientProvider client={queryClient}>
        <CardsPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(mockValidateAgreement).toHaveBeenCalled();
    });
  });

  it('should trigger validation when session is refreshed (TOKEN_REFRESHED)', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <CardsPage />
      </QueryClientProvider>
    );

    // Initial call on mount
    await waitFor(() => expect(mockValidateAgreement).toHaveBeenCalledTimes(1));

    // Fast forward time to avoid debounce (2s for different reason, but here we want to test same reason/event)
    // Actually, mount is "mount", event is "TOKEN_REFRESHED" - different reasons, min 2s
    vi.useFakeTimers();
    vi.advanceTimersByTime(2500);

    // Simulate session refresh
    authChangeHandler('TOKEN_REFRESHED', { access_token: 'new-token' });

    await waitFor(() => {
      expect(mockValidateAgreement).toHaveBeenCalledTimes(2);
    });
    
    vi.useRealTimers();
  });

  it('should respect debounce when session refresh events happen too quickly', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <CardsPage />
      </QueryClientProvider>
    );

    await waitFor(() => expect(mockValidateAgreement).toHaveBeenCalledTimes(1));

    vi.useFakeTimers();
    // Advance only 1s (min wait for different reason is 2s)
    vi.advanceTimersByTime(1000);

    // Trigger auth change quickly
    authChangeHandler('SIGNED_IN', { access_token: 'token' });
    authChangeHandler('TOKEN_REFRESHED', { access_token: 'token' });

    // Should still be 1 because of debounce
    expect(mockValidateAgreement).toHaveBeenCalledTimes(1);
    
    vi.useRealTimers();
  });
});
