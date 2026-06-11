import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { supabase } from '../integrations/supabase/client';

/**
 * Esse teste simula o comportamento de sincronização entre múltiplas sessões.
 * Como estamos em um ambiente de teste unitário/integração, simulamos a "segunda sessão"
 * monitorando as mudanças via Supabase Realtime ou verificando se o fetch reflete a mudança
 * após um evento disparado.
 */
describe('Sincronização de Pagamento entre Sessões', () => {
  let testCardId: string;
  let testCardName = "Cartão Teste Sync";
  let testAccountId: string;

  beforeEach(async () => {
    // Setup: Criar cartão e conta para o teste
    const { data: card, error: cardErr } = await supabase.from('cards').insert({
      name: testCardName,
      brand: 'Mastercard',
      card_limit: 1000,
      closing_day: 1,
      due_day: 10
    }).select().single();

    if (cardErr) {
      console.error("Erro ao criar cartão de teste:", cardErr);
      throw cardErr;
    }

    const { data: account, error: accErr } = await supabase.from('bank_accounts').insert({
      name: "Conta Teste Sync",
      balance: 2000
    }).select().single();

    if (accErr) {
      console.error("Erro ao criar conta de teste:", accErr);
      throw accErr;
    }

    testCardId = card.id;
    testAccountId = account.id;
  });

  afterEach(async () => {
    // Cleanup
    await supabase.from('card_payments').delete().eq('card_id', testCardId);
    await supabase.from('transactions').delete().eq('card', testCardName);
    await supabase.from('cards').delete().eq('id', testCardId);
    await supabase.from('bank_accounts').delete().eq('id', testAccountId);
  });

  it('deve refletir o valor pago na "Sessão B" após o pagamento ser realizado na "Sessão A"', async () => {
    // 1. Verificar saldo inicial (Sessão B - simulada por uma nova consulta)
    const { data: initialPayments } = await supabase
      .from('card_payments')
      .select('amount')
      .eq('card_id', testCardId);
    
    const initialPaidSum = (initialPayments || []).reduce((sum, p) => sum + p.amount, 0);
    expect(initialPaidSum).toBe(0);

    // 2. Realizar pagamento (Simulando Sessão A)
    const paymentAmount = 150.50;
    const { error: paymentError } = await supabase.from('card_payments').insert({
      card_id: testCardId,
      bank_account_id: testAccountId,
      amount: paymentAmount,
      paid_at: new Date().toISOString()
    });

    if (paymentError) throw paymentError;

    // 3. Verificar se o banco de dados foi atualizado (Sessão B consultando novamente)
    // Em um teste de integração, isso valida que a persistência está correta para qualquer outra sessão
    const { data: updatedPayments } = await supabase
      .from('card_payments')
      .select('amount')
      .eq('card_id', testCardId);

    const updatedPaidSum = (updatedPayments || []).reduce((sum, p) => sum + p.amount, 0);
    
    // O valor deve ter sido atualizado
    expect(updatedPaidSum).toBe(paymentAmount);
  });

  it('deve garantir que o evento de atualização (Realtime) é disparado corretamente', async () => {
    // Este teste valida se o canal de Realtime está ativo e recebendo payloads
    // É uma simulação técnica do que as abas usam para sincronizar
    
    const channel = supabase.channel('test-sync-channel');
    let receivedPayload = false;

    await new Promise<void>((resolve) => {
      channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'card_payments' }, () => {
          receivedPayload = true;
          resolve();
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            // Gatilho do pagamento após inscrição
            await supabase.from('card_payments').insert({
              card_id: testCardId,
              bank_account_id: testAccountId,
              amount: 50,
              paid_at: new Date().toISOString()
            });
          }
        });

      // Timeout de segurança
      setTimeout(() => resolve(), 5000);
    });

    expect(receivedPayload).toBe(true);
    await supabase.removeChannel(channel);
  });
});
