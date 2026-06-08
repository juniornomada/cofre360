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

    const periods = groupByBillingCycle(transactions, closingDay, dueDay);
    
    // Find the period containing these transactions
    // Since dates are fixed, we check the transactions array of each period
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

    const periods = groupByBillingCycle(transactions, closingDay, dueDay);
    
    // Check that we have at least two periods with transactions or the base ones
    const txPeriods = periods.filter(p => p.transactions.length > 0);
    expect(txPeriods.length).toBe(2);
    expect(txPeriods[0].total).toBe(100);
    expect(txPeriods[1].total).toBe(200);
  });
});
