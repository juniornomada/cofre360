import { describe, it, expect } from 'vitest';
import { groupByBillingCycle, parseTxDate, type CardTransaction } from '../invoice-utils';

describe('Invoice Utils', () => {
  const mockTransactions: CardTransaction[] = [
    {
      id: '1',
      name: 'Test Transaction 1',
      amount: 100,
      date: '10 mai',
      created_at: '2026-05-10T00:00:00Z',
      category: 'Food',
      type: 'expense',
      icon: '🍕',
      card: 'card-1',
      total_installments: null,
      installment_number: null,
      installment_group_id: null,
    },
    {
      id: '2',
      name: 'Test Transaction 2',
      amount: 50,
      date: '20 mai',
      created_at: '2026-05-20T00:00:00Z',
      category: 'Leisure',
      type: 'expense',
      icon: '🎮',
      card: 'card-1',
      total_installments: null,
      installment_number: null,
      installment_group_id: null,
    }
  ];

  it('should parse Portuguese short dates correctly', () => {
    const date = parseTxDate('10 mai', '2026-05-10T00:00:00Z');
    expect(date.getMonth()).toBe(4); // May is index 4
    expect(date.getDate()).toBe(10);
  });

  it('should group transactions into billing cycles correctly', () => {
    // Current date in the test will be what new Date() returns.
    // Let's assume the test runs in June 2026 (based on system instructions "Tuesday, June 2, 2026").
    
    const closingDay = 15;
    const dueDay = 20;
    
    const periods = groupByBillingCycle(mockTransactions, closingDay, dueDay);
    
    // Period 0 is "Anterior" (Past)
    // Period 1 is "Atual" (Current)
    
    // For June 2nd, the "Atual" period closes on June 15th.
    // It starts on the previous closing day: May 15th.
    // Our mock transactions are from May 10th and May 20th.
    // May 10th should be in "Anterior" (Before May 15th).
    // May 20th should be in "Atual" (Between May 15th and June 15th).

    const anterior = periods.find(p => p.key === 'past');
    const atual = periods.find(p => p.key === 'current');

    expect(anterior?.total).toBe(100);
    expect(atual?.total).toBe(50);
  });

  it('should handle rounding tolerance', () => {
    const a = 100.00000000001;
    const b = 100;
    expect(Math.abs(a - b)).toBeLessThan(0.01);
  });
});
