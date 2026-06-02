import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) throw new Error("Não autorizado");

    const [cardsRes, txRes] = await Promise.all([
      supabaseClient.from("cards").select("*").eq("user_id", user.id),
      supabaseClient.from("transactions").select("*").eq("user_id", user.id).not("card", "is", null),
    ]);

    if (cardsRes.error) throw cardsRes.error;
    if (txRes.error) throw txRes.error;

    const cards = cardsRes.data || [];
    const transactions = txRes.data || [];

    const logs: string[] = [];
    const discrepancies: any[] = [];
    const now = new Date().toISOString();

    // Grouping logic (simplified replicate of groupByBillingCycle if we can't import easily)
    // Actually, I'll just do a basic version or try to include the logic.
    
    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const shortMonthMap: any = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 };

    function parseTxDate(dateStr: string, fallback: string): Date {
      const parts = (dateStr || "").trim().toLowerCase().split(/\s+/);
      const fallbackDate = new Date(fallback);
      const fallbackYear = !isNaN(fallbackDate.getTime()) ? fallbackDate.getFullYear() : new Date().getFullYear();
      if (parts.length === 2) {
        const day = parseInt(parts[0]);
        const monthIdx = shortMonthMap[parts[1]];
        if (!isNaN(day) && monthIdx !== undefined) return new Date(fallbackYear, monthIdx, day);
      }
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? fallbackDate : d;
    }

    cards.forEach(card => {
      const cardTransactions = transactions.filter(t => t.card === card.name);
      
      const cDay = card.closing_day || 1;
      const today = new Date();
      let closingDate = new Date(today.getFullYear(), today.getMonth(), cDay);
      if (today > closingDate) closingDate = new Date(today.getFullYear(), today.getMonth() + 1, cDay);
      const prevClosing = new Date(closingDate.getFullYear(), closingDate.getMonth() - 1, cDay);

      const currentTxs = cardTransactions.filter(tx => {
        const d = parseTxDate(tx.date, tx.created_at);
        return d >= prevClosing && d < closingDate;
      });

      const totalFatura = currentTxs.reduce((sum, tx) => sum + (tx.amount || 0), 0);
      const cardValue = card.used || 0;
      const diff = Math.abs(cardValue - totalFatura);
      const status = diff > 1.00 ? 'error' : (diff > 0.01 ? 'warning' : 'ok');

      logs.push(`${now} - Card ${card.id} (${card.name}): balance ${cardValue.toFixed(2)} vs fatura ${totalFatura.toFixed(2)} (${status === 'ok' ? '✅' : '⚠️'})`);

      if (status !== 'ok') {
        discrepancies.push({ cardId: card.id, cardName: card.name, type: 'amount', cardValue, faturaValue: totalFatura, status });
      }
    });

    const respStatus = discrepancies.some(d => d.status === 'error') ? 500 : (discrepancies.length ? 207 : 200);

    return new Response(
      JSON.stringify({
        status: respStatus === 200 ? 'ok' : (respStatus === 207 ? 'partial' : 'failed'),
        summary: {
          totalCardsChecked: cards.length,
          totalInvoicesChecked: transactions.length,
          discrepanciesFound: discrepancies.length,
          discrepancyDetails: discrepancies,
        },
        logs,
      }),
      {
        status: respStatus,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
