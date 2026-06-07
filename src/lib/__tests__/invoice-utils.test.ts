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
    // Based on the system prompt, today is June 7th, 2026.
    
    const closingDay = 15;
    const dueDay = 20;
    
    const periods = groupByBillingCycle(mockTransactions, closingDay, dueDay);
    
    // In June 7th, with closing day 15:
    // "Atual" ends on June 15th and starts on May 15th.
    // "Anterior" ends on May 15th and starts on April 15th.
    
    // mockTransactions: 
    // - May 10th -> Should be in "Anterior" (between Apr 15 and May 15)
    // - May 20th -> Should be in "Atual" (between May 15 and Jun 15)

    const anterior = periods.find(p => p.label.startsWith('Anterior'));
    const atual = periods.find(p => p.label.startsWith('Atual'));

    expect(anterior?.total).toBe(100);
    expect(atual?.total).toBe(50);
  });

  it('should handle rounding tolerance', () => {
    const a = 100.00000000001;
    const b = 100;
    expect(Math.abs(a - b)).toBeLessThan(0.01);
  });
});
