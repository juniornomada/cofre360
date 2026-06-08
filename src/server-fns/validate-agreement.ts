import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { groupByBillingCycle, type CardTransaction } from "@/lib/invoice-utils";

export const validateAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }: { context: any }) => {
    const { supabase, userId } = context;

    const [cardsRes, txRes] = await Promise.all([
      supabase.from("cards").select("*").eq("user_id", userId),
      supabase.from("transactions").select("*").eq("user_id", userId).not("card", "is", null),
    ]);

    if (cardsRes.error) throw cardsRes.error;
    if (txRes.error) throw txRes.error;

    const cards = cardsRes.data || [];
    const transactions = txRes.data || [];

    const logs: string[] = [];
    const discrepancies: any[] = [];
    const now = new Date().toISOString();

    cards.forEach((card: any) => {
      const cardTransactions = transactions.filter((t: any) => t.card === card.name);

      if (cardTransactions.length === 0) {
        logs.push(`${now} - Card ${card.id} (${card.name}) has no associated invoices.`);
        return;
      }

      const invoicePeriods = groupByBillingCycle(cardTransactions as unknown as CardTransaction[], card.closing_day, card.due_day);
      const activeInvoicePeriod = invoicePeriods.find(p => p.key === "current") || invoicePeriods[1] || invoicePeriods[0];

      const totalFatura = activeInvoicePeriod?.total || 0;
      const cardValue = card.used || 0;
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
          cardValue,
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
