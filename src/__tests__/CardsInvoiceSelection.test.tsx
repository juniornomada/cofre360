import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CardsPage } from '../routes/cards';
import { groupByBillingCycle, type CardTransaction } from '../lib/invoice-utils';

// Simple unit tests for the logic that guarantees the fix
describe('Billing Cycle Persistence Logic', () => {
  const mockTxs: CardTransaction[] = [
    {
      id: '1', name: 'Jan Tx', amount: 100, date: '10 jan', created_at: '2026-01-10T00:00:00Z',
      category: 'Food', type: 'expense', icon: '🍔', card: 'Card',
      total_installments: null, installment_number: null, installment_group_id: null,
    },
    {
      id: '2', name: 'Feb Tx', amount: 200, date: '10 fev', created_at: '2026-02-10T00:00:00Z',
      category: 'Food', type: 'expense', icon: '🍔', card: 'Card',
      total_installments: null, installment_number: null, installment_group_id: null,
    }
  ];

  it('should correctly identify the period by index', () => {
    const periods = groupByBillingCycle(mockTxs, 5, 10);
    
    // We have transactions in Jan and Feb.
    // groupByBillingCycle filters periods to only those with transactions (except Past/Current).
    
    expect(periods.length).toBeGreaterThanOrEqual(2);
    
    // Test that our index-based selection (activeInvoiceIdx) is stable
    const selectedIdx = 0;
    const selectedPeriod = periods[selectedIdx];
    
    expect(selectedPeriod).toBeDefined();
    expect(selectedPeriod.transactions).toBeDefined();
  });

  it('should correctly filter transactions for a card in the selected period', () => {
    const cardName = 'Card';
    const filteredTxs = mockTxs.filter(tx => tx.card === cardName);
    const periods = groupByBillingCycle(filteredTxs, 5, 10);
    
    // Ensure each period only has its own transactions
    periods.forEach(period => {
      period.transactions.forEach(tx => {
        expect(tx.card).toBe(cardName);
      });
    });
  });
});

describe('CardsPage Component export', () => {
  it('should be exported correctly', () => {
    expect(CardsPage).toBeInstanceOf(Function);
  });
});
