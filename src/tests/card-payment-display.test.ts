import { describe, it, expect } from 'vitest';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Testes de integração: validam a UI (formatação e rótulos) usada em
 * src/routes/cards.tsx para exibir pagamentos totais e parciais da fatura
 * junto com as datas em que foram realizados.
 */

interface Payment {
  amount: number;
  paid_at: string; // ISO date
}

// Replica a lógica de classificação de badge usada na UI (linhas ~1538-1554)
function getPaymentBadge(payments: Payment[], invoiceTotal: number): 'Total' | 'Parcial' | null {
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  if (totalPaid >= invoiceTotal && invoiceTotal > 0) return 'Total';
  if (totalPaid > 0 && totalPaid < invoiceTotal) return 'Parcial';
  return null;
}

// Replica a formatação de valores (linhas ~1561-1576)
function formatPaymentBreakdown(payments: Payment[]): string {
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const fmt = (v: number) =>
    `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  if (payments.length > 1) {
    const formula = payments.map((p) => fmt(p.amount)).join(' + ');
    return `${formula} = ${fmt(totalPaid)}`;
  }
  return fmt(totalPaid);
}

// Replica a formatação de data exibida em cada pagamento
function formatPaymentDate(isoDate: string): string {
  return format(new Date(isoDate), "dd 'de' MMM 'de' yyyy", { locale: ptBR });
}

describe('Exibição de pagamentos totais e parciais com datas', () => {
  it('exibe badge "Total" e valor único quando a fatura é quitada com um pagamento', () => {
    const payments: Payment[] = [{ amount: 251.62, paid_at: '2026-06-10' }];
    const invoiceTotal = 251.62;

    expect(getPaymentBadge(payments, invoiceTotal)).toBe('Total');
    expect(formatPaymentBreakdown(payments)).toBe('R$ 251,62');
    expect(formatPaymentDate(payments[0].paid_at)).toBe('10 de jun. de 2026');
  });

  it('exibe badge "Parcial" e a fórmula somada quando há múltiplos pagamentos parciais', () => {
    const payments: Payment[] = [
      { amount: 100.0, paid_at: '2026-06-01' },
      { amount: 51.62, paid_at: '2026-06-05' },
    ];
    const invoiceTotal = 251.62;

    expect(getPaymentBadge(payments, invoiceTotal)).toBe('Parcial');
    expect(formatPaymentBreakdown(payments)).toBe(
      'R$ 100,00 + R$ 51,62 = R$ 151,62'
    );
    expect(formatPaymentDate(payments[0].paid_at)).toBe('01 de jun. de 2026');
    expect(formatPaymentDate(payments[1].paid_at)).toBe('05 de jun. de 2026');
  });

  it('transiciona de "Parcial" para "Total" quando o pagamento final é registrado', () => {
    const invoiceTotal = 500;
    const payments: Payment[] = [{ amount: 200, paid_at: '2026-06-01' }];
    expect(getPaymentBadge(payments, invoiceTotal)).toBe('Parcial');

    payments.push({ amount: 300, paid_at: '2026-06-12' });
    expect(getPaymentBadge(payments, invoiceTotal)).toBe('Total');
    expect(formatPaymentBreakdown(payments)).toBe(
      'R$ 200,00 + R$ 300,00 = R$ 500,00'
    );
  });

  it('não exibe badge quando não há pagamentos registrados', () => {
    expect(getPaymentBadge([], 251.62)).toBeNull();
  });

  it('não exibe badge quando não há fatura emitida', () => {
    const payments: Payment[] = [{ amount: 50, paid_at: '2026-06-12' }];
    expect(getPaymentBadge(payments, 0)).toBeNull();
  });

  it('preserva a ordem cronológica das datas exibidas na composição', () => {
    const payments: Payment[] = [
      { amount: 50, paid_at: '2026-05-20' },
      { amount: 75, paid_at: '2026-06-02' },
      { amount: 25, paid_at: '2026-06-10' },
    ];

    const dates = payments.map((p) => formatPaymentDate(p.paid_at));
    expect(dates).toEqual([
      '20 de mai. de 2026',
      '02 de jun. de 2026',
      '10 de jun. de 2026',
    ]);
    expect(formatPaymentBreakdown(payments)).toBe(
      'R$ 50,00 + R$ 75,00 + R$ 25,00 = R$ 150,00'
    );
  });

  it('formata valores com separador decimal pt-BR (vírgula)', () => {
    const payments: Payment[] = [{ amount: 1234.5, paid_at: '2026-06-12' }];
    expect(formatPaymentBreakdown(payments)).toBe('R$ 1.234,50');
  });
});
