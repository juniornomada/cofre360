import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { supabase } from '../integrations/supabase/client';
import { Route } from '../routes/cards';
const Cards = Route.options.component!;


// Mock do Supabase
vi.mock('../integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      then: vi.fn(),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
}));

// Mock do TanStack Router
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => () => {},
  useSearch: () => ({}),
  Link: ({ children, to }: any) => React.createElement('a', { href: to }, children),
}));

describe('Testes E2E de Pagamento de Cartão (Simulados)', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };
  const mockCard = { 
    id: 'card-1', 
    name: 'Visa Infinite', 
    last_four: '1234', 
    brand: 'Visa', 
    card_limit: 1000, 
    used: 500,
    closing_day: 1,
    due_day: 10,
    color: 'bg-blue-500'
  };
  const mockAccount = { id: 'acc-1', name: 'Conta Principal', balance: 2000, icon: 'bank', color: 'blue' };

  beforeEach(() => {
    vi.clearAllMocks();
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: { user: mockUser } }, error: null });
  });

  it('deve permitir navegar até o pagamento e ver o badge "Parcial" após um pagamento parcial', async () => {
    // 1. Mock de dados iniciais: Fatura de R$ 500, nenhum pagamento
    (supabase.from as any).mockImplementation((table: string) => {
      let data: any[] = [];
      if (table === 'cards') data = [mockCard];
      if (table === 'bank_accounts') data = [mockAccount];
      if (table === 'transactions') data = [
        { id: 'tx-1', amount: 500, type: 'expense', card: 'Visa Infinite', date: '2026-06-05', created_at: '2026-06-05T10:00:00Z' }
      ];
      if (table === 'card_payments') data = [
        { id: 'p-1', card_id: 'card-1', amount: 200, paid_at: '2026-06-10T10:00:00Z' }
      ];

      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: (cb: any) => Promise.resolve({ data, error: null }).then(cb),
      };
    });

    // 2. Renderizar o componente
    // Nota: Em um teste real usaríamos o provider do router, aqui simulamos o componente
    // @ts-ignore - simplificação para o teste
    render(React.createElement(Cards));

    // 3. Verificar se o card aparece
    await waitFor(() => {
      expect(screen.getByText('Visa Infinite')).toBeInTheDocument();
    });

    // 4. Clicar no botão de faturas (abrir dialog de faturas)
    const invoicesButton = screen.getByText(/Faturas/i);
    fireEvent.click(invoicesButton);

    // 4.1 Clicar no botão de pagar dentro do dialog de faturas
    await waitFor(() => {
      expect(screen.getByTestId('total-da-fatura-valor')).toBeInTheDocument();
    });
    const payButton = screen.getByText(/Pagar/i);
    fireEvent.click(payButton);

    // 5. Verificar badge "Parcial" e o valor pago acumulado
    await waitFor(() => {
      expect(screen.getByText('Parcial')).toBeInTheDocument();
      // O valor pago simulado é R$ 200,00
      expect(screen.getByText(/R\$ 200,00/)).toBeInTheDocument();
    });

    // 6. Verificar se o valor restante está correto (500 - 200 = 300)
    expect(screen.getByText(/R\$ 300,00/)).toBeInTheDocument();
  });

  it('deve exibir badge "Total" quando a fatura está totalmente paga', async () => {
    // Mock de dados: Fatura de R$ 500, pagamento de R$ 500
    (supabase.from as any).mockImplementation((table: string) => {
      let data: any[] = [];
      if (table === 'cards') data = [mockCard];
      if (table === 'bank_accounts') data = [mockAccount];
      if (table === 'transactions') data = [
        { id: 'tx-1', amount: 500, type: 'expense', card: 'Visa Infinite', date: '2026-06-05', created_at: '2026-06-05T10:00:00Z' }
      ];
      if (table === 'card_payments') data = [
        { id: 'p-1', card_id: 'card-1', amount: 500, paid_at: '2026-06-12T10:00:00Z' }
      ];

      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: (cb: any) => Promise.resolve({ data, error: null }).then(cb),
      };
    });

    // @ts-ignore
    render(React.createElement(Cards));

    await waitFor(() => {
      expect(screen.getByText('Visa Infinite')).toBeInTheDocument();
    });

    const invoicesButton = screen.getByText(/Faturas/i);
    fireEvent.click(invoicesButton);

    await waitFor(() => {
      expect(screen.getByTestId('total-da-fatura-valor')).toBeInTheDocument();
    });
    const payButton = screen.getByText(/Pagar/i);
    fireEvent.click(payButton);

    await waitFor(() => {
      expect(screen.getByText('Total')).toBeInTheDocument();
      expect(screen.getByText(/R\$ 500,00/)).toBeInTheDocument();
    });

    // Valor restante deve ser R$ 0,00
    expect(screen.getByText(/R\$ 0,00/)).toBeInTheDocument();
  });

  it('deve mostrar o detalhamento de múltiplos pagamentos com datas (fórmula)', async () => {
    // Mock de dados: Fatura de R$ 500, dois pagamentos
    (supabase.from as any).mockImplementation((table: string) => {
      let data: any[] = [];
      if (table === 'cards') data = [mockCard];
      if (table === 'bank_accounts') data = [mockAccount];
      if (table === 'transactions') data = [
        { id: 'tx-1', amount: 500, type: 'expense', card: 'Visa Infinite', date: '2026-06-05', created_at: '2026-06-05T10:00:00Z' }
      ];
      if (table === 'card_payments') data = [
        { id: 'p-1', card_id: 'card-1', amount: 150, paid_at: '2026-06-08T10:00:00Z' },
        { id: 'p-2', card_id: 'card-1', amount: 100, paid_at: '2026-06-10T10:00:00Z' }
      ];

      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: (cb: any) => Promise.resolve({ data, error: null }).then(cb),
      };
    });

    // @ts-ignore
    render(React.createElement(Cards));

    const invoicesButton = screen.getByText(/Faturas/i);
    fireEvent.click(invoicesButton);

    await waitFor(() => {
      expect(screen.getByTestId('total-da-fatura-valor')).toBeInTheDocument();
    });
    const payButton = screen.getByText(/Pagar/i);
    fireEvent.click(payButton);

    await waitFor(() => {
      // Verifica a presença da fórmula: R$ 150,00 (08/06) + R$ 100,00 (10/06) =
      expect(screen.getByText(/R\$ 150,00 \(08\/06\) \+ R\$ 100,00 \(10\/06\) =/)).toBeInTheDocument();
      // Total pago: R$ 250,00
      expect(screen.getByText(/R\$ 250,00/)).toBeInTheDocument();
    });
  });
});
