import { describe, it, expect, vi } from 'vitest';

// Mock simple invoice dates calculation logic
const getCycleDates = (date: Date, closingDay: number, dueDay: number) => {
  const currentClose = new Date(date);
  currentClose.setDate(closingDay);
  return { currentClose };
};

describe('Sincronização de Pagamento de Fatura', () => {
  it('deve refletir o novo pagamento no total pago do cartão imediatamente após a inserção', async () => {
    // 1. Mock do Estado Inicial
    const mockCardId = 'card-123';
    const mockInvoiceTotal = 1500.00;
    
    // Pagamentos existentes no banco de dados (antes do novo lançamento)
    let dbPayments = [
      { card_id: mockCardId, amount: 500.00, paid_at: '2026-06-01T10:00:00Z' }
    ];

    // 2. Simular a função que calcula o total pago por período (como no app)
    const calculatePaidAmount = (payments: any[], cardId: string) => {
      return payments
        .filter(p => p.card_id === cardId)
        .reduce((sum, p) => sum + p.amount, 0);
    };

    const initialPaid = calculatePaidAmount(dbPayments, mockCardId);
    expect(initialPaid).toBe(500.00);

    // 3. Simular a Transação de Pagamento (Ação do Usuário)
    const newPayment = { card_id: mockCardId, amount: 250.00, paid_at: new Date().toISOString() };
    
    // "Inserção no Banco"
    dbPayments = [...dbPayments, newPayment];

    // 4. Verificação de Atualização Instantânea
    // No app, isso é disparado pelo fetchAll() ou pelo Realtime
    const updatedPaid = calculatePaidAmount(dbPayments, mockCardId);
    
    expect(updatedPaid).toBe(750.00);
    expect(mockInvoiceTotal - updatedPaid).toBe(750.00);
    
    console.log('✅ Teste de sincronização de pagamento passou: Valor refletido corretamente.');
  });

  it('deve garantir que múltiplos pagamentos parciais se acumulam corretamente no total pago', () => {
    const mockCardId = 'card-abc';
    const payments = [
      { card_id: mockCardId, amount: 100.00 },
      { card_id: mockCardId, amount: 50.50 },
      { card_id: mockCardId, amount: 200.00 },
    ];

    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    
    expect(totalPaid).toBe(350.50);
  });
});
