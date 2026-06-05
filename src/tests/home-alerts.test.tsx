import { render, screen, waitFor } from '@testing-library/react';
import { Dashboard } from '../routes/index';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: '123', email: 'test@example.com' } } } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
      then: vi.fn().mockImplementation((cb) => {
        if (typeof cb === 'function') {
          return Promise.resolve(cb({ data: [], error: null }));
        }
        return Promise.resolve({ data: [], error: null });
      }),
    }),
  },
}));

// Mock user preferences
vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    balanceVisible: true,
    updateBalanceVisible: vi.fn(),
  }),
}));

// Mock TanStack Router
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => ({
    useSearch: () => ({}),
  }),
  Link: ({ children }: any) => <a>{children}</a>,
}));

// Mock SmartLink
vi.mock('@/components/SmartLink', () => ({
  SmartLink: ({ children }: any) => <a>{children}</a>,
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  TrendingUp: () => <div data-testid="icon-trending-up" />,
  Eye: () => <div data-testid="icon-eye" />,
  EyeOff: () => <div data-testid="icon-eye-off" />,
  Bell: () => <div data-testid="icon-bell" />,
  Pencil: () => <div />,
  Trash2: () => <div />,
  CalendarIcon: () => <div />,
  Loader2: () => <div />,
  Clock: () => <div />,
  Wallet: () => <div />,
  ChevronRight: () => <div />,
  ArrowUpRight: () => <div />,
  ArrowDownRight: () => <div />,
  AlertTriangle: () => <div />,
  Sparkles: () => <div />,
  Flame: () => <div />,
  Plus: () => <div />,
  Minus: () => <div />,
  ArrowLeftRight: () => <div />,
  Layers: () => <div />,
  GripVertical: () => <div />,
  Filter: () => <div />,
  FilterX: () => <div />,
  LogOut: () => <div />,
  CreditCard: () => <div />,
  Landmark: () => <div />,
}));

describe('Dashboard (Home Page)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render the deprecated alert "Você ainda não registrou nada hoje"', async () => {
    render(
      <TooltipProvider>
        <Dashboard />
      </TooltipProvider>
    );
    
    // Use waitFor because of the loading state
    await waitFor(() => {
      expect(screen.queryByText(/Você ainda não registrou nada hoje/i)).not.toBeInTheDocument();
    });
  });

  it('shows empty state when no transactions are returned', async () => {
    render(
      <TooltipProvider>
        <Dashboard />
      </TooltipProvider>
    );
    
    await waitFor(() => {
      // The Dashboard uses EmptyState component which renders this title
      expect(screen.getByText(/Nenhuma transação encontrada/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});
