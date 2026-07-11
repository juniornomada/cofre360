import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runReconciliation } from "./engine";
import type { ReconciliationInput, ReconciliationRule, CheckType, RuleKind, ToleranceKind } from "./types";

// ------------------------- Rules CRUD -------------------------

export const listRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (ctx: any) => {
    const $input = ctx.data;
    const $ctx = ctx.context;
    const { data, error } = await $ctx.supabase
      .from("reconciliation_rules")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as ReconciliationRule[];
  });

export const upsertRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const v = raw as Partial<ReconciliationRule>;
    if (!v || typeof v !== "object") throw new Error("payload inválido");
    if (!v.name || typeof v.name !== "string") throw new Error("name obrigatório");
    const check_types: CheckType[] = ["bank_account", "card", "invoice", "budget"];
    const rule_kinds: RuleKind[] = ["equality", "sum", "zero"];
    const tol_kinds: ToleranceKind[] = ["abs", "pct"];
    if (!check_types.includes(v.check_type as CheckType)) throw new Error("check_type inválido");
    if (!rule_kinds.includes(v.rule_kind as RuleKind)) throw new Error("rule_kind inválido");
    if (!tol_kinds.includes(v.tolerance_kind as ToleranceKind)) throw new Error("tolerance_kind inválido");
    const tolerance_value = Number(v.tolerance_value ?? 0);
    if (!Number.isFinite(tolerance_value) || tolerance_value < 0) throw new Error("tolerance_value inválido");
    const target_ids = Array.isArray(v.target_ids) ? v.target_ids.filter((x) => typeof x === "string") : [];
    return {
      id: typeof v.id === "string" ? v.id : undefined,
      name: v.name.trim().slice(0, 200),
      check_type: v.check_type as CheckType,
      rule_kind: v.rule_kind as RuleKind,
      tolerance_kind: v.tolerance_kind as ToleranceKind,
      tolerance_value,
      target_ids,
      enabled: v.enabled !== false,
    };
  })
  .handler(async (ctx: any) => {
    const $input = ctx.data;
    const $ctx = ctx.context;
    const payload = { ...data, user_id: $ctx.userId };
    const q = $input.id
      ? $ctx.supabase.from("reconciliation_rules").update(payload).eq("id", $input.id).select().single()
      : $ctx.supabase.from("reconciliation_rules").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw error;
    return row as ReconciliationRule;
  });

export const deleteRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const v = raw as { id?: string };
    if (!v?.id) throw new Error("id obrigatório");
    return { id: v.id };
  })
  .handler(async (ctx: any) => {
    const $input = ctx.data;
    const $ctx = ctx.context;
    const { error } = await $ctx.supabase.from("reconciliation_rules").delete().eq("id", $input.id);
    if (error) throw error;
    return { ok: true };
  });

// ------------------------- Run + persist -------------------------

async function loadInputData(
  supabase: any,
  userId: string,
  periodStart: string,
  periodEnd: string
): Promise<ReconciliationInput> {
  const [bankRes, txRes, cardRes, payRes, budRes, ruleRes] = await Promise.all([
    supabase.from("bank_accounts").select("id,name,balance").eq("user_id", userId),
    supabase
      .from("transactions")
      .select("id,date,created_at,amount,type,is_visible,bank_account_id,card,category,transfer_direction")
      .eq("user_id", userId)
      .gte("date", periodStart)
      .lte("date", periodEnd),
    supabase.from("cards").select("id,name,used,closing_day,due_day").eq("user_id", userId),
    supabase.from("card_payments").select("id,card_id,amount,date").eq("user_id", userId),
    supabase
      .from("budget_categories")
      .select("id,category,amount,period_start,period_end")
      .eq("user_id", userId),
    supabase.from("reconciliation_rules").select("*").eq("user_id", userId).eq("enabled", true),
  ]);

  const errs = [bankRes, txRes, cardRes, payRes, budRes, ruleRes].map((r) => r.error).filter(Boolean);
  if (errs.length) throw errs[0];

  return {
    bankAccounts: (bankRes.data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      opening_balance: Number(r.balance ?? 0),
    })),
    transactions: (txRes.data ?? []).map((r: any) => ({
      id: r.id,
      date: String(r.date),
      created_at: r.created_at,
      amount: Number(r.amount ?? 0),
      type: r.type,
      is_visible: r.is_visible,
      bank_account_id: r.bank_account_id,
      card: r.card,
      category: r.category,
      transfer_direction: r.transfer_direction,
    })),
    cards: (cardRes.data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      used: Number(r.used ?? 0),
      closing_day: Number(r.closing_day ?? 1),
      due_day: Number(r.due_day ?? 1),
    })),
    cardPayments: (payRes.data ?? []).map((r: any) => ({
      id: r.id,
      card_id: r.card_id,
      amount: Number(r.amount ?? 0),
      date: String(r.date),
    })),
    budgets: (budRes.data ?? []).map((r: any) => ({
      id: r.id,
      category: r.category,
      amount: Number(r.amount ?? 0),
      period_start: r.period_start ?? periodStart,
      period_end: r.period_end ?? periodEnd,
    })),
    rules: (ruleRes.data ?? []) as ReconciliationRule[],
    periodStart,
    periodEnd,
  };
}

export const runNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const v = raw as { periodStart?: string; periodEnd?: string };
    if (!v?.periodStart || !v?.periodEnd) throw new Error("período obrigatório");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(v.periodEnd)) {
      throw new Error("formato de data inválido (YYYY-MM-DD)");
    }
    if (v.periodStart > v.periodEnd) throw new Error("periodStart > periodEnd");
    return { periodStart: v.periodStart, periodEnd: v.periodEnd };
  })
  .handler(async (ctx: any) => {
    const $input = ctx.data;
    const $ctx = ctx.context;
    const { supabase, userId } = context;
    const { data: run, error: runErr } = await supabase
      .from("reconciliation_runs")
      .insert({
        user_id: userId,
        triggered_by: "manual",
        period_start: $input.periodStart,
        period_end: $input.periodEnd,
        status: "running",
      })
      .select()
      .single();
    if (runErr) throw runErr;

    try {
      const input = await loadInputData(supabase, userId, $input.periodStart, $input.periodEnd);
      const result = runReconciliation(input);

      if (result.divergences.length > 0) {
        const rows = result.divergences.map((d) => ({
          run_id: run.id,
          user_id: userId,
          check_type: d.check_type,
          entity_id: d.entity_id,
          entity_label: d.entity_label,
          expected: d.expected,
          actual: d.actual,
          delta: d.delta,
          rule_id: d.rule_id ?? null,
        }));
        const { error: divErr } = await supabase.from("reconciliation_divergences").insert(rows);
        if (divErr) throw divErr;
      }

      const { data: updated, error: upErr } = await supabase
        .from("reconciliation_runs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          divergences_count: result.divergences.length,
          total_divergence_amount: result.total_divergence_amount,
          payload: result,
        })
        .eq("id", run.id)
        .select()
        .single();
      if (upErr) throw upErr;
      return { run: updated, result };
    } catch (err) {
      await supabase
        .from("reconciliation_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: err instanceof Error ? err.message : String(err),
        })
        .eq("id", run.id);
      throw err;
    }
  });

export const listRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (ctx: any) => {
    const $input = ctx.data;
    const $ctx = ctx.context;
    const { data, error } = await $ctx.supabase
      .from("reconciliation_runs")
      .select("id,triggered_by,period_start,period_end,status,divergences_count,total_divergence_amount,started_at,completed_at")
      .order("started_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return data ?? [];
  });

export const listOpenDivergences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (ctx: any) => {
    const $input = ctx.data;
    const $ctx = ctx.context;
    const { data, error } = await $ctx.supabase
      .from("reconciliation_divergences")
      .select("*")
      .eq("investigated", false)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  });

export const countOpenDivergences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (ctx: any) => {
    const $input = ctx.data;
    const $ctx = ctx.context;
    const { count, error } = await $ctx.supabase
      .from("reconciliation_divergences")
      .select("id", { count: "exact", head: true })
      .eq("investigated", false);
    if (error) throw error;
    return { count: count ?? 0 };
  });

export const markInvestigated = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const v = raw as { id?: string; note?: string; investigated?: boolean };
    if (!v?.id) throw new Error("id obrigatório");
    return {
      id: v.id,
      note: typeof v.note === "string" ? v.note.slice(0, 500) : null,
      investigated: v.investigated !== false,
    };
  })
  .handler(async (ctx: any) => {
    const $input = ctx.data;
    const $ctx = ctx.context;
    const { error } = await $ctx.supabase
      .from("reconciliation_divergences")
      .update({
        investigated: $input.investigated,
        investigated_at: $input.investigated ? new Date().toISOString() : null,
        note: $input.note,
      })
      .eq("id", $input.id);
    if (error) throw error;
    return { ok: true };
  });

export const exportRunCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const v = raw as { runId?: string };
    if (!v?.runId) throw new Error("runId obrigatório");
    return { runId: v.runId };
  })
  .handler(async (ctx: any) => {
    const $input = ctx.data;
    const $ctx = ctx.context;
    const { data: rows, error } = await $ctx.supabase
      .from("reconciliation_divergences")
      .select("check_type,entity_label,expected,actual,delta,investigated,note,created_at")
      .eq("run_id", $input.runId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const header = "tipo,entidade,esperado,real,delta,investigada,nota,data";
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = (rows ?? []).map((r: any) =>
      [r.check_type, r.entity_label, r.expected, r.actual, r.delta, r.investigated, r.note, r.created_at]
        .map(escape)
        .join(",")
    );
    return { csv: [header, ...lines].join("\n") };
  });
