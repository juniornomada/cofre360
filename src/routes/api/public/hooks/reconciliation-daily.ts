import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { runReconciliation } from "@/lib/reconciliation/engine";
import type { ReconciliationInput, ReconciliationRule } from "@/lib/reconciliation/types";

/**
 * Cron endpoint called daily by pg_cron.
 * Runs reconciliation for the previous day for every user that has at least
 * one enabled optional rule, and persists divergences.
 *
 * The canonical month cross-check is intentionally left to the authenticated
 * manual flow because `financial_month_facts()` is scoped by `auth.uid()`;
 * a service-role cron request has no end-user auth context. All other automatic
 * integrity checks and enabled optional rules still run here.
 */
export const Route = (createFileRoute as any)("/api/public/hooks/reconciliation-daily")({
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

        const { data: ruleUsers, error: ruErr } = await supa
          .from("reconciliation_rules")
          .select("user_id")
          .eq("enabled", true);
        if (ruErr) return Response.json({ error: ruErr.message }, { status: 500 });

        const userIds = Array.from(new Set((ruleUsers ?? []).map((r: any) => String(r.user_id)).filter(Boolean)));

        let processed = 0;
        for (const userId of userIds) {
          try {
            const [txs, cards, banks, buds, pays, refunds, rules] = await Promise.all([
              supa
                .from("transactions")
                .select("id,date,transaction_date,purchase_date,created_at,amount,type,transaction_kind,is_visible,bank_account_id,card,card_id,category,installment_group_id,installment_number,total_installments,installment_source_amount")
                .eq("user_id", userId),
              supa.from("cards").select("id,name,used,closing_day,due_day").eq("user_id", userId),
              supa.from("bank_accounts").select("id,name,balance").eq("user_id", userId),
              supa.from("budget_categories").select("id,category,budget_limit").eq("user_id", userId),
              supa.from("card_payments").select("id,card_id,bank_account_id,amount,paid_at,target_period").eq("user_id", userId),
              supa
                .from("card_refunds")
                .select("id,transaction_id,card_name,original_amount,refund_amount,status,refund_transaction_id,confirmed_at,created_at")
                .eq("user_id", userId),
              supa.from("reconciliation_rules").select("*").eq("user_id", userId).eq("enabled", true),
            ]);

            const queryErrors = [txs, cards, banks, buds, pays, refunds, rules]
              .map((result) => result.error)
              .filter(Boolean);
            if (queryErrors.length) throw queryErrors[0];

            const dateOnly = (value: unknown) => String(value || "").slice(0, 10);

            const input: ReconciliationInput = {
              periodStart,
              periodEnd,
              transactions: (txs.data ?? []).map((r: any) => {
                const kind = r.transaction_kind || null;
                const type = String(r.type || "expense");
                return {
                  id: String(r.id),
                  date: dateOnly(r.transaction_date || r.date),
                  created_at: r.created_at,
                  purchase_date: r.purchase_date ? dateOnly(r.purchase_date) : null,
                  amount: Number(r.amount ?? 0),
                  type,
                  transaction_kind: kind,
                  is_visible: r.is_visible,
                  bank_account_id: r.bank_account_id,
                  card: r.card,
                  card_id: r.card_id,
                  category: r.category,
                  transfer_direction:
                    kind === "transfer"
                      ? type === "income"
                        ? "in"
                        : type === "expense"
                          ? "out"
                          : null
                      : null,
                  installment_group_id: r.installment_group_id,
                  installment_number: r.installment_number == null ? null : Number(r.installment_number),
                  total_installments: r.total_installments == null ? null : Number(r.total_installments),
                  installment_source_amount:
                    r.installment_source_amount == null ? null : Number(r.installment_source_amount),
                };
              }),
              cards: (cards.data ?? []).map((r: any) => ({
                id: String(r.id),
                name: String(r.name || "Cartão"),
                used: Number(r.used ?? 0),
                closing_day: Number(r.closing_day ?? 1),
                due_day: Number(r.due_day ?? 1),
              })),
              bankAccounts: (banks.data ?? []).map((r: any) => ({
                id: String(r.id),
                name: String(r.name || "Conta"),
                opening_balance: Number(r.balance ?? 0),
              })),
              budgets: (buds.data ?? []).map((r: any) => ({
                id: String(r.id),
                category: String(r.category || "Sem categoria"),
                amount: Number(r.budget_limit ?? 0),
                period_start: periodStart,
                period_end: periodEnd,
              })),
              cardPayments: (pays.data ?? []).map((r: any) => ({
                id: String(r.id),
                card_id: String(r.card_id || ""),
                bank_account_id: r.bank_account_id,
                amount: Number(r.amount ?? 0),
                date: dateOnly(r.paid_at || r.target_period),
                target_period: r.target_period ? dateOnly(r.target_period) : null,
              })),
              cardRefunds: (refunds.data ?? []).map((r: any) => ({
                id: String(r.id),
                transaction_id: String(r.transaction_id || ""),
                card_name: r.card_name,
                original_amount: Number(r.original_amount ?? 0),
                refund_amount: Number(r.refund_amount ?? 0),
                status: String(r.status || ""),
                refund_transaction_id: r.refund_transaction_id,
                date: dateOnly(r.confirmed_at || r.created_at),
              })),
              rules: (rules.data ?? []) as ReconciliationRule[],
              canonicalFacts: [],
            };

            const result = runReconciliation(input);

            const { data: run, error: runError } = await supa
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
            if (runError) throw runError;

            if (run && result.divergences.length > 0) {
              const { error: divergenceError } = await supa.from("reconciliation_divergences").insert(
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
              if (divergenceError) throw divergenceError;
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