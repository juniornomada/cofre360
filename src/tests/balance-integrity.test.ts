import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/integrations/supabase/client';

// Mock do Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(),
  },
}));

// Helper para arredondar como o app faz
const round = (val: number) => Math.round(val * 100) / 100;

describe('Integridade de Saldos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve garantir que o saldo calculado de uma conta bata com saldo_inicial + entradas - saídas', async () => {
    const mockInitialBalance = 1000.50;
    const mockTransactions = [
      { type: 'income', amount: 500, bank_account_id: 'acc1', is_visible: true },
      { type: 'expense', amount: 200.25, bank_account_id: 'acc1', is_visible: true },
      { type: 'expense', amount: 50.10, bank_account_id: 'acc1', is_visible: false }, // Não deve contar se invisível (conforme lógica em transactions.tsx)
      { type: 'income', amount: 100, bank_account_id: 'acc1', is_visible: true },
    ];

    // Simular lógica de cálculo das páginas
    const income = mockTransactions
      .filter(tx => tx.bank_account_id === 'acc1' && tx.type === 'income' && tx.is_visible !== false)
      .reduce((sum, tx) => sum + tx.amount, 0);
    
    const expense = mockTransactions
      .filter(tx => tx.bank_account_id === 'acc1' && tx.type === 'expense' && tx.is_visible !== false)
      .reduce((sum, tx) => sum + tx.amount, 0);

    const calculatedBalance = round(mockInitialBalance + income - expense);
    
    // Verificação de precisão (Floating point issues)
    // 1000.50 + 500 + 100 - 200.25 = 1400.25
    expect(calculatedBalance).toBe(1400.25);
  });

  it('deve garantir que a soma das transações filtradas bata com o total exibido', () => {
    const transactions = [
      { amount: 100, type: 'income', category: 'Salário', is_visible: true },
      { amount: 50, type: 'expense', category: 'Alimentação', is_visible: true },
      { amount: 30, type: 'expense', category: 'Lazer', is_visible: true },
    ];

    const activeCategory = 'Todas';
    
    const filtered = transactions.filter(tx => 
      activeCategory === 'Todas' || tx.category === activeCategory
    );

    const totalIncome = filtered
      .filter(t => t.type === 'income' && t.is_visible !== false)
      .reduce((s, t) => s + t.amount, 0);
      
    const totalExpense = filtered
      .filter(t => t.type === 'expense' && t.is_visible !== false)
      .reduce((s, t) => s + t.amount, 0);

    expect(totalIncome).toBe(100);
    expect(totalExpense).toBe(80);
    expect(round(totalIncome - totalExpense)).toBe(20);
  });
});
