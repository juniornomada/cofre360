import { describe, it, expect } from 'vitest';
import { groupByBillingCycle, type CardTransaction } from '../invoice-utils';

describe('groupByBillingCycle calculation logic', () => {
  const closingDay = 10;
  const dueDay = 20;

  it('should correctly sum expenses and subtract incomes (credits)', () => {
    // We need to ensure dates fall within the same cycle
    // Based on invoice-utils.ts:
    // current cycle is between prevClose and currentClose
    // Let's create transactions with fixed ISO dates to avoid dynamic issues in test
    
    const transactions: CardTransaction[] = [
      {
        id: '1',
        name: 'Compra 1',
        amount: 100.00,
        type: 'expense',
        date: '2024-01-15', // Will determine the period
        created_at: '2024-01-15T10:00:00Z',
        category: 'Alimentação',
        icon: '🍔',
        installment_group_id: null,
        installment_number: null,
        total_installments: null,
      },
      {
        id: '2',
        name: 'Compra 2',
        amount: 50.50,
        type: 'expense',
        date: '2024-01-16',
        created_at: '2024-01-16T10:00:00Z',
        category: 'Lazer',
        icon: '🎮',
        installment_group_id: null,
        installment_number: null,
        total_installments: null,
      },
      {
        id: '3',
        name: 'Estorno',
        amount: 20.00,
        type: 'income',
        date: '2024-01-17',
        created_at: '2024-01-17T10:00:00Z',
        category: 'Outros',
        icon: '💰',
        installment_group_id: null,
        installment_number: null,
        total_installments: null,
      }
    ];

    const refDate = new Date('2024-01-25');
    const periods = groupByBillingCycle(transactions, closingDay, dueDay, refDate);
    
    // Find the period containing these transactions
    const periodWithTxs = periods.find(p => p.transactions.length === 3);
    
    expect(periodWithTxs).toBeDefined();
    if (periodWithTxs) {
      // 100 + 50.50 - 20 = 130.50
      expect(periodWithTxs.total).toBeCloseTo(130.50);
    }
  });

  it('should handle zero transactions correctly', () => {
    const periods = groupByBillingCycle([], closingDay, dueDay);
    expect(periods[0].total).toBe(0);
    expect(periods[1].total).toBe(0);
  });

  it('should handle multiple periods correctly', () => {
    const transactions: CardTransaction[] = [
      {
        id: '1',
        name: 'Jan Tx',
        amount: 100,
        type: 'expense',
        date: '2024-01-15',
        created_at: '2024-01-15T00:00:00Z',
        category: 'X',
        icon: 'X',
        installment_group_id: null,
        installment_number: null,
        total_installments: null,
      },
      {
        id: '2',
        name: 'Feb Tx',
        amount: 200,
        type: 'expense',
        date: '2024-02-15',
        created_at: '2024-02-15T00:00:00Z',
        category: 'Y',
        icon: 'Y',
        installment_group_id: null,
        installment_number: null,
        total_installments: null,
      }
    ];

    const refDate = new Date('2024-03-01');
    const periods = groupByBillingCycle(transactions, closingDay, dueDay, refDate);
    
    // Check that we have at least two periods with transactions
    const txPeriods = periods.filter(p => p.transactions.length > 0);
    expect(txPeriods.length).toBe(2);
    // Values might appear in "Anterior" or other past periods depending on refDate
    // But they should be calculated correctly
    const janTx = periods.find(p => p.transactions.some(t => t.name === 'Jan Tx'));
    const febTx = periods.find(p => p.transactions.some(t => t.name === 'Feb Tx'));
    
    expect(janTx?.total).toBe(100);
    expect(febTx?.total).toBe(200);
  });
});
