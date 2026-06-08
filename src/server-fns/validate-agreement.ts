import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { supabase } from "@/integrations/supabase/client";
import { groupByBillingCycle, type CardTransaction } from "@/lib/invoice-utils";

export const validateAgreement = createServerFn({ method: "POST" })
  .handler(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error("Não autorizado");
    }

    const [cardsRes, txRes] = await Promise.all([
      supabaseAdmin.from("cards").select("*").eq("user_id", session.user.id),
      supabaseAdmin.from("transactions").select("*").eq("user_id", session.user.id).not("card", "is", null),
    ]);

    if (cardsRes.error) throw cardsRes.error;
    if (txRes.error) throw txRes.error;

    const cards = cardsRes.data || [];
    const transactions = txRes.data || [];

    const logs: string[] = [];
    const discrepancies: any[] = [];
    const now = new Date().toISOString();

    cards.forEach(card => {
      const cardTransactions = transactions.filter(t => t.card === card.name);
      
      if (cardTransactions.length === 0) {
        logs.push(`${now} - Card ${card.id} (${card.name}) has no associated invoices.`);
        discrepancies.push({
          cardId: card.id,
          cardName: card.name,
          type: 'missing',
          status: 'error',
        });
        return;
      }

      // Replicate frontend logic to find the "current" invoice
      const invoicePeriods = groupByBillingCycle(cardTransactions as unknown as CardTransaction[], card.closing_day, card.due_day);
      const activeInvoicePeriod = invoicePeriods.find(p => p.key === "current") || invoicePeriods[1] || invoicePeriods[0];
      
      const totalFatura = activeInvoicePeriod?.total || 0;
      
      // In this app, "faturaAtual" is calculated on the fly in the UI.
      // However, we might want to compare it with something else if "faturaAtual" was a field.
      // Since it's calculated, we are basically verifying that the calculation matches.
      // But if there's a "used" field in the database that is supposed to track it, we compare against that.
      
      const cardValue = card.used || 0; // The cards table has a 'used' column
      const diff = Math.abs(cardValue - totalFatura);
      const status = diff > 1.00 ? 'error' : (diff > 0.01 ? 'warning' : 'ok');

      logs.push(
        `${now} - Card ${card.id} (${card.name}): card balance ${cardValue.toFixed(2)} vs total fatura ${totalFatura.toFixed(2)} (${status === 'ok' ? '✅' : status === 'warning' ? '⚠️' : '❌'})`
      );

      if (status !== 'ok') {
        discrepancies.push({
          cardId: card.id,
          cardName: card.name,
          type: 'amount',
          cardValue: cardValue,
          faturaValue: totalFatura,
          status,
        });
      }
    });

    return {
      status: discrepancies.some(d => d.status === 'error') ? 'failed' : (discrepancies.length ? 'partial' : 'ok'),
      summary: {
        totalCardsChecked: cards.length,
        totalInvoicesChecked: transactions.length,
        discrepanciesFound: discrepancies.length,
        discrepancyDetails: discrepancies,
      },
      logs,
    };
  });
