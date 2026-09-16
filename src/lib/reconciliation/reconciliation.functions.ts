import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runReconciliation } from "./engine";
import type {
  ReconciliationInput,
  ReconciliationRule,
  CheckType,
  RuleKind,
  ToleranceKind,
  CanonicalMonthFacts,
} from "./types";

// ------------------------- Rules CRUD -------------------------

export const listRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (ctx: any) => {
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
    const payload = { ...$input, user_id: $ctx.userId };
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

function dateOnly(value: unknown): string {
  return String(value || "").slice(0, 10);
}

function monthStartsBetween(periodStart: string, periodEnd: string): string[] {
  const [sy, sm] = periodStart.split("-").map(Number);
  const [ey, em] = periodEnd.split("-").map(Number);
  const out: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function normalizeFacts(raw: any): CanonicalMonthFacts {
  return {
    month: String(raw?.month || ""),
    income: Number(raw?.income || 0),
    expense: Number(raw?.expense || 0),
    cardExpenseComponent: Number(raw?.cardExpenseComponent || 0),
    categories: Array.isArray(raw?.categories)
      ? raw.categories.map((r: any) => ({ category: String(r?.category || "Sem categoria"), amount: Number(r?.amount || 0) }))
      : [],
    cards: Array.isArray(raw?.cards)
      ? raw.cards.map((r: any) => ({ card: String(r?.card || "Cartão"), amount: Number(r?.amount || 0) }))
      : [],
  };
}

async function loadInputData(
  supabase: any,
  userId: string,
  periodStart: string,
  periodEnd: string,
): Promise<ReconciliationInput> {
  const [bankRes, txRes, cardRes, payRes, refundRes, budRes, ruleRes] = await Promise.all([
    supabase.from("bank_accounts").select("id,name,balance").eq("user_id", userId),
    supabase
      .from("transactions")
      .select("id,date,transaction_date,purchase_date,created_at,amount,type,transaction_kind,is_visible,bank_account_id,card,card_id,category,installment_group_id,installment_number,total_installments,installment_source_amount")
      .eq("user_id", userId),
    supabase.from("cards").select("id,name,used,closing_day,due_day").eq("user_id", userId),
    supabase.from("card_payments").select("id,card_id,bank_account_id,amount,paid_at,target_period").eq("user_id", userId),
    supabase
      .from("card_refunds")
      .select("id,transaction_id,card_name,original_amount,refund_amount,status,refund_transaction_id,confirmed_at,created_at")
      .eq("user_id", userId),
    supabase.from("budget_categories").select("id,category,budget_limit").eq("user_id", userId),
    supabase.from("reconciliation_rules").select("*").eq("user_id", userId).eq("enabled", true),
  ]);

  const errs = [bankRes, txRes, cardRes, payRes, refundRes, budRes, ruleRes].map((r) => r.error).filter(Boolean);
  if (errs.length) throw errs[0];

  const canonicalFacts: CanonicalMonthFacts[] = [];
  for (const month of monthStartsBetween(periodStart, periodEnd)) {
    const { data, error } = await supabase.rpc("financial_month_facts", { p_month: month });
    if (error) throw error;
    canonicalFacts.push(normalizeFacts(data));
  }

  return {
    bankAccounts: (bankRes.data ?? []).map((r: any) => ({
      id: String(r.id),
      name: String(r.name || "Conta"),
      opening_balance: Number(r.balance ?? 0),
    })),
    transactions: (txRes.data ?? []).map((r: any) => {
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
        transfer_direction: kind === "transfer" ? (type === "income" ? "in" : type === "expense" ? "out" : null) : null,
        installment_group_id: r.installment_group_id,
        installment_number: r.installment_number == null ? null : Number(r.installment_number),
        total_installments: r.total_installments == null ? null : Number(r.total_installments),
        installment_source_amount: r.installment_source_amount == null ? null : Number(r.installment_source_amount),
      };
    }),
    cards: (cardRes.data ?? []).map((r: any) => ({
      id: String(r.id),
      name: String(r.name || "Cartão"),
      used: Number(r.used ?? 0),
      closing_day: Number(r.closing_day ?? 1),
      due_day: Number(r.due_day ?? 1),
    })),
    cardPayments: (payRes.data ?? []).map((r: any) => ({
      id: String(r.id),
      card_id: String(r.card_id || ""),
      bank_account_id: r.bank_account_id,
      amount: Number(r.amount ?? 0),
      date: dateOnly(r.paid_at || r.target_period),
      target_period: r.target_period ? dateOnly(r.target_period) : null,
    })),
    cardRefunds: (refundRes.data ?? []).map((r: any) => ({
      id: String(r.id),
      transaction_id: String(r.transaction_id || ""),
      card_name: r.card_name,
      original_amount: Number(r.original_amount ?? 0),
      refund_amount: Number(r.refund_amount ?? 0),
      status: String(r.status || ""),
      refund_transaction_id: r.refund_transaction_id,
      date: dateOnly(r.confirmed_at || r.created_at),
    })),
    budgets: (budRes.data ?? []).map((r: any) => ({
      id: String(r.id),
      category: String(r.category || "Sem categoria"),
      amount: Number(r.budget_limit ?? 0),
      period_start: periodStart,
      period_end: periodEnd,
    })),
    rules: (ruleRes.data ?? []) as ReconciliationRule[],
    canonicalFacts,
    periodStart,
    periodEnd,
  };
}

async function resolvePreviousAutomaticDivergences(
  supabase: any,
  userId: string,
  periodStart: string,
  periodEnd: string,
  currentRunId: string,
) {
  const { data: oldRuns, error } = await supabase
    .from("reconciliation_runs")
    .select("id")
    .eq("user_id", userId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .neq("id", currentRunId);
  if (error) throw error;
  const ids = (oldRuns ?? []).map((r: any) => r.id).filter(Boolean);
  if (!ids.length) return;
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("reconciliation_divergences")
    .update({ status: "resolved", investigated: true, investigated_at: now, resolved_at: now })
    .in("run_id", ids)
    .is("rule_id", null)
    .neq("status", "resolved");
  if (updateError) throw updateError;
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
    const { supabase, userId } = $ctx;
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

      await resolvePreviousAutomaticDivergences(supabase, userId, $input.periodStart, $input.periodEnd, run.id);

      if (result.divergences.length > 0) {
        const rows = result.divergences.map((d) => ({
          run_id: run.id,
          user_id: userId,
          check_type: d.check_type,
          entity_id: null,
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
    const $ctx = ctx.context;
    const { data, error } = await $ctx.supabase
      .from("reconciliation_runs")
      .select("id,triggered_by,period_start,period_end,status,divergences_count,total_divergence_amount,started_at,completed_at,payload,error_message")
      .order("started_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return data ?? [];
  });

export const listOpenDivergences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (ctx: any) => {
    const $ctx = ctx.context;
    const { data, error } = await $ctx.supabase
      .from("reconciliation_divergences")
      .select("*")
      .neq("status", "resolved")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  });

export const countOpenDivergences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (ctx: any) => {
    const $ctx = ctx.context;
    const { count, error } = await $ctx.supabase
      .from("reconciliation_divergences")
      .select("id", { count: "exact", head: true })
      .neq("status", "resolved");
    if (error) throw error;
    return { count: count ?? 0 };
  });

export const updateDivergence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const v = raw as { id?: string; status?: string; note?: string };
    if (!v?.id) throw new Error("id obrigatório");
    const status = v.status;
    if (status && !["open", "investigating", "resolved"].includes(status)) {
      throw new Error("status inválido");
    }
    return {
      id: v.id,
      status: (status as "open" | "investigating" | "resolved" | undefined) ?? undefined,
      note: typeof v.note === "string" ? v.note.slice(0, 1000) : undefined,
    };
  })
  .handler(async (ctx: any) => {
    const $input = ctx.data;
    const $ctx = ctx.context;
    const patch: Record<string, unknown> = {};
    if ($input.status !== undefined) {
      patch.status = $input.status;
      patch.investigated = $input.status !== "open";
      patch.investigated_at = $input.status !== "open" ? new Date().toISOString() : null;
      patch.resolved_at = $input.status === "resolved" ? new Date().toISOString() : null;
    }
    if ($input.note !== undefined) patch.note = $input.note;
    const { error } = await $ctx.supabase
      .from("reconciliation_divergences")
      .update(patch)
      .eq("id", $input.id);
    if (error) throw error;
    return { ok: true };
  });

export const markInvestigated = updateDivergence;

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
      return /[\",\n]/.test(s) ? `\"${s.replace(/\"/g, '\"\"')}\"` : s;
    };
    const lines = (rows ?? []).map((r: any) =>
      [r.check_type, r.entity_label, r.expected, r.actual, r.delta, r.investigated, r.note, r.created_at]
        .map(escape)
        .join(",")
    );
    return { csv: [header, ...lines].join("\n") };
  });
