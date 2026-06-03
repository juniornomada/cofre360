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
    vi.useFakeTimers();
    
    render(
      <QueryClientProvider client={queryClient}>
        <CardsPage />
      </QueryClientProvider>
    );

    // 1. Mount trigger
    // Since runValidation is async, we need to run timers until it's called
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    
    expect(mockValidateAgreement).toHaveBeenCalledTimes(1);

    // 2. Debounce check: different reason (mount vs focus) requires 2s
    // Attempt within 1s -> should skip
    await act(async () => {
      vi.advanceTimersByTime(1000);
      window.dispatchEvent(new Event('focus'));
    });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(1);

    // Attempt after 2s -> should run
    await act(async () => {
      vi.advanceTimersByTime(1100); // Total 2.1s
      window.dispatchEvent(new Event('focus'));
    });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(2);

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
    expect(mockValidateAgreement).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it('should trigger validation on auth events (SIGNED_IN, TOKEN_REFRESHED)', async () => {
    vi.useFakeTimers();
    render(
      <QueryClientProvider client={queryClient}>
        <CardsPage />
      </QueryClientProvider>
    );

    // Initial mount call
    await act(async () => { vi.runOnlyPendingTimers(); });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(1);

    // SIGNED_IN after 2.1s (different reason than 'mount')
    await act(async () => {
      vi.advanceTimersByTime(2100);
      authChangeHandler('SIGNED_IN', { access_token: 'token' });
    });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(2);

    // TOKEN_REFRESHED after 1s (same reason category 'SIGNED_IN'/'TOKEN_REFRESHED' categories are not same string but events)
    // Actually the code uses the event string as reason.
    // 'SIGNED_IN' vs 'TOKEN_REFRESHED' are different strings, so min wait is 2s.
    
    // Within 1s -> skip
    await act(async () => {
      vi.advanceTimersByTime(1000);
      authChangeHandler('TOKEN_REFRESHED', { access_token: 'token' });
    });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(2); // Still 2

    // After 2.1s total -> run
    await act(async () => {
      vi.advanceTimersByTime(1100);
      authChangeHandler('TOKEN_REFRESHED', { access_token: 'token' });
    });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it('should handle rapid sequences of session refreshes and respect dynamic debounce', async () => {
    vi.useFakeTimers();
    render(
      <QueryClientProvider client={queryClient}>
        <CardsPage />
      </QueryClientProvider>
    );

    // 1. Initial mount call
    await act(async () => { vi.runOnlyPendingTimers(); });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(1);

    // 2. Rapid sequence of same event (TOKEN_REFRESHED)
    // Wait 2.1s since mount to allow a new trigger (different reason: mount -> TOKEN_REFRESHED)
    vi.advanceTimersByTime(2100);

    await act(async () => {
      // Trigger 5 times in 1 second
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(200);
        authChangeHandler('TOKEN_REFRESHED', { access_token: `token-${i}` });
      }
    });

    // Should only have been called once more (total 2) because minWait for same reason is 5s
    expect(mockValidateAgreement).toHaveBeenCalledTimes(2);

    // 3. Rapid sequence of alternating events
    // Wait 5.1s since last TOKEN_REFRESHED to allow a new trigger
    vi.advanceTimersByTime(5100);

    await act(async () => {
      // Trigger SIGNED_IN (different reason -> 2s wait)
      authChangeHandler('SIGNED_IN', { access_token: 'token-signed-in' });
    });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(3);

    await act(async () => {
      // Trigger TOKEN_REFRESHED immediately (different reason -> 2s wait required)
      vi.advanceTimersByTime(500);
      authChangeHandler('TOKEN_REFRESHED', { access_token: 'token-refreshed-fast' });
    });
    // Should still be 3 because 500ms < 2000ms
    expect(mockValidateAgreement).toHaveBeenCalledTimes(3);

    await act(async () => {
      // Trigger TOKEN_REFRESHED after 2.1s (different reason -> 2s wait)
      vi.advanceTimersByTime(1600); // Total 2.1s since last successful validation
      authChangeHandler('TOKEN_REFRESHED', { access_token: 'token-refreshed-ok' });
    });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(4);

    vi.useRealTimers();
  });

  it('should allow immediate retry after a failed validation', async () => {
    vi.useFakeTimers();
    render(
      <QueryClientProvider client={queryClient}>
        <CardsPage />
      </QueryClientProvider>
    );

    // 1. Initial mount call
    await act(async () => { vi.runOnlyPendingTimers(); });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(1);

    // 2. Mock a failure for the next call
    mockValidateAgreement.mockRejectedValueOnce(new Error('Server Error'));

    // Trigger focus - should attempt and fail
    await act(async () => {
      vi.advanceTimersByTime(2100); // Pass different reason debounce
      window.dispatchEvent(new Event('focus'));
    });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(2);

    // 3. Debounce should be reset because of the error. 
    // Triggering focus AGAIN immediately should work.
    await act(async () => {
      vi.advanceTimersByTime(100); // Very short time
      window.dispatchEvent(new Event('focus'));
    });
    
    // Total should be 3 because the error reset the debounce
    expect(mockValidateAgreement).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it('should handle multiple consecutive failures and allow retries while respecting inter-error debounce', async () => {
    vi.useFakeTimers();
    render(
      <QueryClientProvider client={queryClient}>
        <CardsPage />
      </QueryClientProvider>
    );

    // 1. Initial mount call (Success)
    await act(async () => { vi.runOnlyPendingTimers(); });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(1);

    // 2. Mock multiple consecutive failures
    mockValidateAgreement.mockRejectedValue(new Error('Persistent Server Error'));

    // Trigger focus -> Fail 1
    await act(async () => {
      vi.advanceTimersByTime(2100);
      window.dispatchEvent(new Event('focus'));
    });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(2);

    // Trigger focus again immediately -> Fail 2
    // Even though it failed, we might want a SMALL debounce between errors to avoid flooding
    // But the current requirement from previous step was "reset timestamp on failure".
    // Let's verify it allows immediate consecutive retries if they fail.
    await act(async () => {
      vi.advanceTimersByTime(100); 
      window.dispatchEvent(new Event('focus'));
    });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(3);

    // Trigger focus again -> Fail 3
    await act(async () => {
      vi.advanceTimersByTime(100);
      window.dispatchEvent(new Event('focus'));
    });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(4);

    // 3. Finally succeeds
    mockValidateAgreement.mockResolvedValueOnce(mockResult);
    await act(async () => {
      vi.advanceTimersByTime(100);
      window.dispatchEvent(new Event('focus'));
    });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(5);

    // 4. After SUCCESS, the 5s debounce MUST be active again for same reason
    await act(async () => {
      vi.advanceTimersByTime(1000);
      window.dispatchEvent(new Event('focus'));
    });
    // Should still be 5
    expect(mockValidateAgreement).toHaveBeenCalledTimes(5);

    vi.useRealTimers();
  });

  it('should strictly respect debounce intervals after a sequence of failures followed by a success', async () => {
    vi.useFakeTimers();
    render(
      <QueryClientProvider client={queryClient}>
        <CardsPage />
      </QueryClientProvider>
    );

    // 1. Initial successful validation on mount
    await act(async () => { vi.runOnlyPendingTimers(); });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(1);

    // 2. Simulate a failure
    mockValidateAgreement.mockRejectedValueOnce(new Error('Temporary Failure'));
    await act(async () => {
      vi.advanceTimersByTime(2100); // Pass different reason window
      window.dispatchEvent(new Event('focus'));
    });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(2);

    // 3. Immediate retry after failure should work (reset logic)
    mockValidateAgreement.mockResolvedValueOnce(mockResult);
    await act(async () => {
      vi.advanceTimersByTime(100); 
      window.dispatchEvent(new Event('focus'));
    });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(3);

    // 4. NOW it succeeded. The 5s debounce for 'focus' MUST be strictly respected.
    
    // Attempt at 4.9s -> Should skip
    await act(async () => {
      vi.advanceTimersByTime(4800); // 100 + 4800 = 4900ms since last success
      window.dispatchEvent(new Event('focus'));
    });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(3);

    // Attempt at 5.1s -> Should run
    await act(async () => {
      vi.advanceTimersByTime(200); // 4900 + 200 = 5100ms since last success
      window.dispatchEvent(new Event('focus'));
    });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(4);

    vi.useRealTimers();
  });

  it('should reset debounce and allow immediate retry on 401 Unauthorized error', async () => {
    vi.useFakeTimers();
    render(
      <QueryClientProvider client={queryClient}>
        <CardsPage />
      </QueryClientProvider>
    );

    // 1. Initial successful validation on mount
    await act(async () => { vi.runOnlyPendingTimers(); });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(1);

    // 2. Mock a 401 Response error
    const mockResponse = new Response('Unauthorized', { status: 401 });
    mockValidateAgreement.mockRejectedValueOnce(mockResponse);

    await act(async () => {
      vi.advanceTimersByTime(2100); // Pass different reason window
      window.dispatchEvent(new Event('focus'));
    });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(2);

    // 3. Debounce should be reset. Verify immediate retry is possible.
    mockValidateAgreement.mockResolvedValueOnce(mockResult);
    await act(async () => {
      vi.advanceTimersByTime(100); 
      window.dispatchEvent(new Event('focus'));
    });
    
    expect(mockValidateAgreement).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it('should reset debounce and allow immediate retry on 403 Forbidden error', async () => {
    vi.useFakeTimers();
    render(
      <QueryClientProvider client={queryClient}>
        <CardsPage />
      </QueryClientProvider>
    );

    // 1. Initial successful validation on mount
    await act(async () => { vi.runOnlyPendingTimers(); });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(1);

    // 2. Mock a 403 Response error
    const mockResponse = new Response('Forbidden', { status: 403 });
    mockValidateAgreement.mockRejectedValueOnce(mockResponse);

    await act(async () => {
      vi.advanceTimersByTime(2100);
      window.dispatchEvent(new Event('focus'));
    });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(2);

    // 3. Debounce should be reset. Verify immediate retry is possible.
    mockValidateAgreement.mockResolvedValueOnce(mockResult);
    await act(async () => {
      vi.advanceTimersByTime(100); 
      window.dispatchEvent(new Event('focus'));
    });
    
    expect(mockValidateAgreement).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it('should NOT reset debounce on non-retryable 4xx errors (e.g. 400 Bad Request)', async () => {
    vi.useFakeTimers();
    render(
      <QueryClientProvider client={queryClient}>
        <CardsPage />
      </QueryClientProvider>
    );

    // 1. Initial successful validation on mount
    await act(async () => { vi.runOnlyPendingTimers(); });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(1);

    // 2. Mock a 400 Bad Request error
    const mockResponse = new Response('Bad Request', { status: 400 });
    mockValidateAgreement.mockRejectedValueOnce(mockResponse);

    await act(async () => {
      vi.advanceTimersByTime(2100); // Pass different reason window (mount -> focus)
      window.dispatchEvent(new Event('focus'));
    });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(2);

    // 3. Debounce should NOT be reset for non-retryable errors.
    // Triggering focus again immediately should be blocked.
    await act(async () => {
      vi.advanceTimersByTime(100); 
      window.dispatchEvent(new Event('focus'));
    });
    
    // Should still be 2 because 400 is not a retryable error in our current logic
    expect(mockValidateAgreement).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('should reset debounce when session is missing to allow immediate retry after login', async () => {
    vi.useFakeTimers();
    
    // Start with no session for ALL calls initially
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CardsPage />
      </QueryClientProvider>
    );

    // 1. Initial mount call (should check session and stop)
    await act(async () => { vi.runOnlyPendingTimers(); });
    expect(mockValidateAgreement).not.toHaveBeenCalled();

    // 2. Mock session being restored
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: { access_token: 'valid-token', user: { id: 'user-1' } } },
      error: null,
    });

    // 3. Trigger SIGNED_IN event (this is what happens when user logs in)
    await act(async () => {
      // Even though 'mount' attempted validation 100ms ago, 
      // the failure to find a session should have reset the debounce.
      vi.advanceTimersByTime(100);
      authChangeHandler('SIGNED_IN', { access_token: 'valid-token' });
    });

    // Should trigger immediately because of reset
    expect(mockValidateAgreement).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
