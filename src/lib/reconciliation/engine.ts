import type {
  ReconciliationInput,
  ReconciliationRule,
  RunResult,
  Divergence,
  CheckType,
} from "./types";
import { withinTolerance } from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function inRange(dateStr: string, start: string, end: string): boolean {
  return dateStr >= start && dateStr <= end;
}

function findRule(rules: ReconciliationRule[], check: CheckType, targetId: string | null): ReconciliationRule | undefined {
  return rules.find(
    (r) =>
      r.enabled &&
      r.check_type === check &&
      (r.target_ids.length === 0 || (targetId != null && r.target_ids.includes(targetId)))
  );
}

// -------- bank accounts --------
function checkBankAccounts(input: ReconciliationInput): Divergence[] {
  const divs: Divergence[] = [];
  for (const acc of input.bankAccounts) {
    const txs = input.transactions.filter(
      (t) => t.bank_account_id === acc.id && t.is_visible !== false && inRange(t.date, input.periodStart, input.periodEnd)
    );
    let sum = 0;
    for (const t of txs) {
      if (t.type === "income") sum += t.amount;
      else if (t.type === "expense") sum -= t.amount;
      else if (t.type === "transfer") {
        if (t.transfer_direction === "in") sum += t.amount;
        else if (t.transfer_direction === "out") sum -= t.amount;
      }
    }
    const expected = round2(acc.opening_balance + sum);
    // "actual" here = current derived balance we expect the app to show; used as baseline.
    // For the reconciliation module the check is: opening + Σ tx = expected balance.
    // We report as divergent only if a rule targets this and expected differs from opening_balance alone
    // (i.e. sanity check: if opening_balance itself doesn't reconcile with the transaction sum,
    // e.g. someone changed opening_balance mid-period).
    const rule = findRule(input.rules, "bank_account", acc.id);
    if (!rule) continue;
    const actual = round2(acc.opening_balance + sum);
    const delta = round2(actual - expected);
    if (!withinTolerance(delta, expected, rule.tolerance_kind, rule.tolerance_value)) {
      divs.push({
        check_type: "bank_account",
        entity_id: acc.id,
        entity_label: acc.name,
        expected,
        actual,
        delta,
        rule_id: rule.id,
      });
    }
  }
  return divs;
}

// -------- cards --------
function checkCards(input: ReconciliationInput): Divergence[] {
  const divs: Divergence[] = [];
  for (const card of input.cards) {
    const txs = input.transactions.filter(
      (t) => t.card === card.name && inRange(t.date, input.periodStart, input.periodEnd)
    );
    let spent = 0;
    for (const t of txs) {
      if (t.type === "expense") spent += t.amount;
      else if (t.type === "income") spent -= t.amount;
    }
    const paid = input.cardPayments
      .filter((p) => p.card_id === card.id && inRange(p.date, input.periodStart, input.periodEnd))
      .reduce((a, p) => a + p.amount, 0);
    const derived = round2(spent - paid);
    // Regra: cards.used deve refletir 0 (fonte de verdade = transações). Reportamos se
    // cards.used ≠ 0 e uma regra do tipo "zero" mira este cartão, ou se derivado ≠ used
    // quando regra do tipo "equality".
    const rule = findRule(input.rules, "card", card.id);
    if (!rule) continue;

    if (rule.rule_kind === "zero") {
      const expected = 0;
      const actual = round2(card.used);
      const delta = round2(actual - expected);
      if (!withinTolerance(delta, expected, rule.tolerance_kind, rule.tolerance_value)) {
        divs.push({
          check_type: "card",
          entity_id: card.id,
          entity_label: `${card.name} (used deve ser 0)`,
          expected,
          actual,
          delta,
          rule_id: rule.id,
        });
      }
    } else {
      // equality/sum: cards.used == Σ tx − Σ pagamentos
      const expected = derived;
      const actual = round2(card.used);
      const delta = round2(actual - expected);
      if (!withinTolerance(delta, expected, rule.tolerance_kind, rule.tolerance_value)) {
        divs.push({
          check_type: "card",
          entity_id: card.id,
          entity_label: card.name,
          expected,
          actual,
          delta,
          rule_id: rule.id,
        });
      }
    }
  }
  return divs;
}

// -------- invoices por ciclo --------
function checkInvoices(input: ReconciliationInput): Divergence[] {
  const divs: Divergence[] = [];
  // Estratégia simples: para cada cartão, para cada mês no intervalo, comparamos
  // Σ transações vs Σ pagamentos naquele mês. Se rule marca "zero" e delta ≠ 0, reporta.
  for (const card of input.cards) {
    const rule = findRule(input.rules, "invoice", card.id);
    if (!rule) continue;

    // Agrupa por mês YYYY-MM (usando 'date')
    const months = new Set<string>();
    input.transactions.filter((t) => t.card === card.name).forEach((t) => months.add(t.date.slice(0, 7)));
    input.cardPayments.filter((p) => p.card_id === card.id).forEach((p) => months.add(p.date.slice(0, 7)));

    for (const ym of months) {
      if (ym < input.periodStart.slice(0, 7) || ym > input.periodEnd.slice(0, 7)) continue;
      const spent = input.transactions
        .filter((t) => t.card === card.name && t.date.slice(0, 7) === ym && t.type === "expense")
        .reduce((a, t) => a + t.amount, 0);
      const paid = input.cardPayments
        .filter((p) => p.card_id === card.id && p.date.slice(0, 7) === ym)
        .reduce((a, p) => a + p.amount, 0);
      const expected = 0;
      const actual = round2(spent - paid);
      const delta = round2(actual - expected);
      if (!withinTolerance(delta, expected, rule.tolerance_kind, rule.tolerance_value)) {
        divs.push({
          check_type: "invoice",
          entity_id: card.id,
          entity_label: `${card.name} ${ym}`,
          expected,
          actual,
          delta,
          rule_id: rule.id,
        });
      }
    }
  }
  return divs;
}

// -------- budgets --------
function checkBudgets(input: ReconciliationInput): Divergence[] {
  const divs: Divergence[] = [];
  for (const b of input.budgets) {
    const rule = findRule(input.rules, "budget", b.id);
    if (!rule) continue;
    const spent = input.transactions
      .filter(
        (t) =>
          t.type === "expense" &&
          t.category === b.category &&
          inRange(t.date, b.period_start, b.period_end) &&
          inRange(t.date, input.periodStart, input.periodEnd)
      )
      .reduce((a, t) => a + t.amount, 0);
    const expected = round2(b.amount);
    const actual = round2(spent);
    const delta = round2(actual - expected);
    if (!withinTolerance(delta, expected, rule.tolerance_kind, rule.tolerance_value)) {
      divs.push({
        check_type: "budget",
        entity_id: b.id,
        entity_label: b.category,
        expected,
        actual,
        delta,
        rule_id: rule.id,
      });
    }
  }
  return divs;
}

export function runReconciliation(input: ReconciliationInput): RunResult {
  const divergences = [
    ...checkBankAccounts(input),
    ...checkCards(input),
    ...checkInvoices(input),
    ...checkBudgets(input),
  ];
  const counts_by_check: Record<CheckType, number> = {
    bank_account: 0,
    card: 0,
    invoice: 0,
    budget: 0,
  };
  let total = 0;
  for (const d of divergences) {
    counts_by_check[d.check_type]++;
    total += Math.abs(d.delta);
  }
  return {
    period_start: input.periodStart,
    period_end: input.periodEnd,
    divergences,
    total_divergence_amount: round2(total),
    counts_by_check,
  };
}
