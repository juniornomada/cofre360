import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { runReconciliation } from "@/lib/reconciliation/engine";
import type { ReconciliationInput } from "@/lib/reconciliation/types";

/**
 * Cron endpoint called daily by pg_cron.
 * Runs reconciliation for the previous day for every user that has at least
 * one enabled rule, and persists divergences.
 */
export const Route = createFileRoute("/api/public/hooks/reconciliation-daily")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("apikey") ?? request.headers.get("authorization")?.replace("Bearer ", "");
        const expected = process.env.SUPABASE_ANON_KEY;
        if (!authHeader || !expected || authHeader !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const url = process.env.SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supa = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const periodEnd = yesterday.toISOString().slice(0, 10);
        const periodStart = periodEnd;

        // Users with at least one enabled rule
        const { data: ruleUsers, error: ruErr } = await supa
          .from("reconciliation_rules")
          .select("user_id")
          .eq("enabled", true);
        if (ruErr) return Response.json({ error: ruErr.message }, { status: 500 });

        const userIds = Array.from(new Set((ruleUsers ?? []).map((r: any) => r.user_id)));

        let processed = 0;
        for (const userId of userIds) {
          try {
            const [txs, cards, banks, buds, pays] = await Promise.all([
              supa.from("transactions").select("*").eq("user_id", userId).lte("date", periodEnd),
              supa.from("cards").select("*").eq("user_id", userId),
              supa.from("bank_accounts").select("*").eq("user_id", userId),
              supa.from("budget_categories").select("*").eq("user_id", userId),
              supa.from("card_payments").select("*").eq("user_id", userId).lte("payment_date", periodEnd),
            ]);

            const input: ReconciliationInput = {
              periodStart,
              periodEnd,
              transactions: (txs.data ?? []) as any,
              cards: (cards.data ?? []) as any,
              bankAccounts: (banks.data ?? []) as any,
              budgets: (buds.data ?? []) as any,
              cardPayments: (pays.data ?? []) as any,
              rules: [],
            };
            const result = runReconciliation(input);

            const { data: run } = await supa
              .from("reconciliation_runs")
              .insert({
                user_id: userId,
                triggered_by: "scheduled",
                period_start: periodStart,
                period_end: periodEnd,
                status: "completed",
                completed_at: new Date().toISOString(),
                divergences_count: result.divergences.length,
                total_divergence_amount: result.total_divergence_amount,
                payload: result,
              })
              .select()
              .single();

            if (run && result.divergences.length > 0) {
              await supa.from("reconciliation_divergences").insert(
                result.divergences.map((d) => ({
                  run_id: run.id,
                  user_id: userId,
                  check_type: d.check_type,
                  entity_id: d.entity_id,
                  entity_label: d.entity_label,
                  expected: d.expected,
                  actual: d.actual,
                  delta: d.delta,
                  rule_id: d.rule_id ?? null,
                }))
              );
            }
            processed++;
          } catch (e) {
            console.error("recon-daily user failed", userId, e);
          }
        }

        return Response.json({ ok: true, processed, users: userIds.length });
      },
    },
  },
});
