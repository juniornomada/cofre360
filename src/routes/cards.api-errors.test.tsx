import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { supabase } from '@/integrations/supabase/client';
import { CardsPage } from './cards';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertContext } from './__root';

/**
 * Integration tests for the /api/cards (validateAgreement server fn) flow.
 *
 * Validates that the frontend gracefully handles:
 *  - HTTP 500 server failures
 *  - Unexpected / malformed response shapes
 *  - Network errors (no status)
 *  - Response objects with non-JSON bodies
 *
 * The page must:
 *  - never crash (render keeps working)
 *  - log the error to the console
 *  - reset its internal debounce for retryable errors (>=500 / 401 / 403 / network)
 *  - not surface noisy alerts when the validation is silent (mount/focus/auth events)
 *  - keep `isValidating` consistent (always reset to false in the `finally` block)
 */

const okResult = {
  status: 'ok',
  summary: {
    totalCardsChecked: 0,
    totalInvoicesChecked: 0,
    discrepanciesFound: 0,
    discrepancyDetails: [],
  },
  details: [],
  logs: [],
};

const mockValidateAgreement = vi.fn();

vi.mock('@tanstack/react-start', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useServerFn: () => mockValidateAgreement,
    createFileRoute: () => ({ useSearch: () => ({}) }),
  };
});

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useSearch: () => ({}),
    useRouter: () => ({ state: { location: { search: {} } } }),
    useMatch: () => ({}),
    Link: ({ children }: any) => children,
    createFileRoute: () => () => ({ useSearch: () => ({}) }),
  };
});

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

vi.mock('@/components/PdfInvoiceImportDialog', () => ({ PdfInvoiceImportDialog: () => null }));
vi.mock('@/components/CalculatorAmountInput', () => ({ CalculatorAmountInput: () => null }));
vi.mock('@/components/CardBrand', () => ({ CardBrand: () => null, brandPresets: [] }));
vi.mock('@/components/BankLogo', () => ({ BankLogo: () => null, bankPresets: [] }));
vi.mock('@/components/InvoiceInconsistencyAlert', () => ({ InvoiceInconsistencyAlert: () => null }));

function renderPage(mockShowAlert = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AlertContext.Provider value={{ showAlert: mockShowAlert }}>
        <CardsPage />
      </AlertContext.Provider>
    </QueryClientProvider>
  );
  return { ...utils, mockShowAlert };
}

describe('CardsPage - /api/cards error handling integration', () => {
  let authChangeHandler: any;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: { access_token: 'mock-token', user: { id: 'user-1' } } },
      error: null,
    });

    (supabase.auth.onAuthStateChange as any).mockImplementation((cb: any) => {
      authChangeHandler = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('handles 500 Response without crashing and resets debounce for retry', async () => {
    vi.useFakeTimers();
    const error500 = new Response(JSON.stringify({ message: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
    mockValidateAgreement.mockRejectedValueOnce(error500);

    const { container } = renderPage();

    await act(async () => { vi.runOnlyPendingTimers(); });
    await waitFor(() => expect(mockValidateAgreement).toHaveBeenCalledTimes(1));

    // Page still rendered (didn't throw to error boundary)
    expect(container.firstChild).toBeTruthy();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Validation error:', expect.anything());

    // Debounce reset (retryable) -> next focus immediately runs
    mockValidateAgreement.mockResolvedValueOnce(okResult);
    await act(async () => {
      vi.advanceTimersByTime(100);
      window.dispatchEvent(new Event('focus'));
    });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('handles plain Error (network failure, no status) as retryable', async () => {
    vi.useFakeTimers();
    mockValidateAgreement.mockRejectedValueOnce(new Error('Network request failed'));

    const { container } = renderPage();
    await act(async () => { vi.runOnlyPendingTimers(); });
    await waitFor(() => expect(mockValidateAgreement).toHaveBeenCalledTimes(1));

    expect(container.firstChild).toBeTruthy();

    // Retry should be allowed immediately
    mockValidateAgreement.mockResolvedValueOnce(okResult);
    await act(async () => {
      vi.advanceTimersByTime(50);
      window.dispatchEvent(new Event('focus'));
    });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('handles unexpected response shape (null) without crashing', async () => {
    vi.useFakeTimers();
    mockValidateAgreement.mockResolvedValueOnce(null);

    const { container } = renderPage();
    await act(async () => { vi.runOnlyPendingTimers(); });
    await waitFor(() => expect(mockValidateAgreement).toHaveBeenCalledTimes(1));

    expect(container.firstChild).toBeTruthy();
    vi.useRealTimers();
  });

  it('handles unexpected response shape (string instead of object)', async () => {
    vi.useFakeTimers();
    mockValidateAgreement.mockResolvedValueOnce('unexpected-string-payload' as any);

    const { container } = renderPage();
    await act(async () => { vi.runOnlyPendingTimers(); });
    await waitFor(() => expect(mockValidateAgreement).toHaveBeenCalledTimes(1));

    expect(container.firstChild).toBeTruthy();
    vi.useRealTimers();
  });

  it('handles unexpected response missing summary/details fields', async () => {
    vi.useFakeTimers();
    mockValidateAgreement.mockResolvedValueOnce({ status: 'ok' } as any);

    const { container } = renderPage();
    await act(async () => { vi.runOnlyPendingTimers(); });
    await waitFor(() => expect(mockValidateAgreement).toHaveBeenCalledTimes(1));

    expect(container.firstChild).toBeTruthy();
    vi.useRealTimers();
  });

  it('handles Response with non-JSON body by falling back to text()', async () => {
    vi.useFakeTimers();
    const badBody = new Response('<html>Server Error</html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html' },
    });
    mockValidateAgreement.mockRejectedValueOnce(badBody);

    const { container } = renderPage();
    await act(async () => { vi.runOnlyPendingTimers(); });
    await waitFor(() => expect(mockValidateAgreement).toHaveBeenCalledTimes(1));

    // Should not crash even though JSON parse fails
    expect(container.firstChild).toBeTruthy();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Validation error:', expect.anything());

    // 502 is retryable -> debounce reset
    mockValidateAgreement.mockResolvedValueOnce(okResult);
    await act(async () => {
      vi.advanceTimersByTime(100);
      window.dispatchEvent(new Event('focus'));
    });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('does NOT reset debounce for non-retryable 4xx (e.g. 422 Unprocessable)', async () => {
    vi.useFakeTimers();
    const err422 = new Response(JSON.stringify({ message: 'Invalid' }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });
    mockValidateAgreement.mockRejectedValueOnce(err422);

    renderPage();
    await act(async () => { vi.runOnlyPendingTimers(); });
    await waitFor(() => expect(mockValidateAgreement).toHaveBeenCalledTimes(1));

    // Immediate focus -> should be blocked by debounce
    await act(async () => {
      vi.advanceTimersByTime(100);
      window.dispatchEvent(new Event('focus'));
    });
    expect(mockValidateAgreement).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('keeps page interactive across multiple consecutive 500s', async () => {
    vi.useFakeTimers();
    const make500 = () => new Response('boom', { status: 500 });
    mockValidateAgreement
      .mockRejectedValueOnce(make500())
      .mockRejectedValueOnce(make500())
      .mockRejectedValueOnce(make500())
      .mockResolvedValueOnce(okResult);

    const { container } = renderPage();
    await act(async () => { vi.runOnlyPendingTimers(); });
    await waitFor(() => expect(mockValidateAgreement).toHaveBeenCalledTimes(1));

    for (let i = 0; i < 3; i++) {
      await act(async () => {
        vi.advanceTimersByTime(50);
        window.dispatchEvent(new Event('focus'));
      });
    }

    // 1 (mount) + 3 (focus retries) = 4 calls
    await waitFor(() => expect(mockValidateAgreement).toHaveBeenCalledTimes(4));
    expect(container.firstChild).toBeTruthy();
    vi.useRealTimers();
  });

  it('does not surface alerts when silent validation (mount) fails', async () => {
    vi.useFakeTimers();
    mockValidateAgreement.mockRejectedValueOnce(new Response('boom', { status: 500 }));
    const { mockShowAlert } = renderPage();
    await act(async () => { vi.runOnlyPendingTimers(); });
    await waitFor(() => expect(mockValidateAgreement).toHaveBeenCalledTimes(1));

    // Silent mode -> no user-facing alerts
    expect(mockShowAlert).not.toHaveBeenCalledWith(
      expect.stringContaining('Erro ao validar'),
      'error'
    );
    vi.useRealTimers();
  });

  it('treats missing session as a non-error short-circuit (no validation call)', async () => {
    vi.useFakeTimers();
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const { container, mockShowAlert } = renderPage();
    await act(async () => { vi.runOnlyPendingTimers(); });

    expect(mockValidateAgreement).not.toHaveBeenCalled();
    expect(container.firstChild).toBeTruthy();
    // Silent: no alert displayed
    expect(mockShowAlert).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
