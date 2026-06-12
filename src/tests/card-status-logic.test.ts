import { describe, it, expect } from 'vitest';

// Simulação simplificada da lógica de negócio encontrada em src/routes/cards.tsx
// para validar o status da fatura (Paga total / Parcialmente paga) e saldo restante.

interface CardStatus {
  invoiceTotal: number;
  paidAmount: number;
}

function calculateCardStatus(status: CardStatus) {
  const remaining = Math.max(0, status.invoiceTotal - status.paidAmount);
  const isFullyPaid = status.invoiceTotal > 0 && remaining === 0;
  const isPartiallyPaid = status.paidAmount > 0 && remaining > 0;
  
  return {
    remaining,
    isFullyPaid,
    isPartiallyPaid
  };
}

describe('Status do Cartão e Saldo Restante', () => {
  it('deve marcar como Paga Total quando o valor pago for igual ao total da fatura', () => {
    const status = calculateCardStatus({
      invoiceTotal: 251.62,
      paidAmount: 251.62
    });

    expect(status.remaining).toBe(0);
    expect(status.isFullyPaid).toBe(true);
    expect(status.isPartiallyPaid).toBe(false);
  });

  it('deve marcar como Parcialmente Paga quando houver pagamentos parciais mas saldo restante', () => {
    // Exemplo: "R$100,00" + "R$51,62" = R$151,62 pagos de uma fatura de R$251,62
    const invoiceTotal = 251.62;
    const payments = [100.00, 51.62];
    const paidAmount = payments.reduce((acc, val) => acc + val, 0);

    const status = calculateCardStatus({
      invoiceTotal,
      paidAmount
    });

    // 251.62 - 151.62 = 100.00
    expect(status.remaining).toBeCloseTo(100.00, 2);
    expect(status.isFullyPaid).toBe(false);
    expect(status.isPartiallyPaid).toBe(true);
  });

  it('deve atualizar corretamente após um novo pagamento parcial ser adicionado', () => {
    const invoiceTotal = 500.00;
    let paidAmount = 0;

    // Primeiro pagamento parcial
    paidAmount += 200.00;
    let status = calculateCardStatus({ invoiceTotal, paidAmount });
    expect(status.remaining).toBe(300.00);
    expect(status.isPartiallyPaid).toBe(true);
    expect(status.isFullyPaid).toBe(false);

    // Segundo pagamento (quitando a fatura)
    paidAmount += 300.00;
    status = calculateCardStatus({ invoiceTotal, paidAmount });
    expect(status.remaining).toBe(0);
    expect(status.isPartiallyPaid).toBe(false);
    expect(status.isFullyPaid).toBe(true);
  });

  it('não deve marcar como paga se não houver fatura (total zero)', () => {
    const status = calculateCardStatus({
      invoiceTotal: 0,
      paidAmount: 0
    });

    expect(status.remaining).toBe(0);
    expect(status.isFullyPaid).toBe(false);
    expect(status.isPartiallyPaid).toBe(false);
  });

  it('deve lidar com pagamentos excedentes (marcar como paga total)', () => {
    const status = calculateCardStatus({
      invoiceTotal: 100.00,
      paidAmount: 150.00
    });

    expect(status.remaining).toBe(0);
    expect(status.isFullyPaid).toBe(true);
    expect(status.isPartiallyPaid).toBe(false);
  });
});
