import type {
  ReconciliationInput,
  ReconciliationRule,
  RunResult,
  Divergence,
  CheckType,
  CheckSummary,
} from "./types";
import { withinTolerance } from "./types";
import {
  computeCardConsistency,
  computeMonthlyCategoryTotals,
  computeMonthlyFinancialSummary,
  inferTransactionKind,
  normalizeFinancialText,
} from "@/lib/financial-engine";
import { getBillingCycleMonthKey } from "@/lib/invoice-utils";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function inRange(dateStr: string | null | undefined, start: string, end: string): boolean {
  return Boolean(dateStr && dateStr >= start && dateStr <= end);
}

function monthKey(dateStr: string | null | undefined): string {
  return String(dateStr || "").slice(0, 7);
}

function findRule(rules: ReconciliationRule[], check: CheckType, targetId: string | null): ReconciliationRule | undefined {
  return rules.find(
    (r) =>
      r.enabled &&
      r.check_type === check &&
      (r.target_ids.length === 0 || (targetId != null && r.target_ids.includes(targetId)))
  );
}

function pushIssue(
  list: Divergence[],
  check_type: CheckType,
  entity_label: string,
  expected: number,
  actual: number,
  rule_id: string | null = null,
) {
  list.push({
    check_type,
    entity_id: null,
    entity_label,
    expected: round2(expected),
    actual: round2(actual),
    delta: round2(actual - expected),
    rule_id,
  });
}

function summary(check_type: CheckType, label: string, checked: number, issues: number): CheckSummary {
  return { check_type, label, checked, issues };
}

// -----------------------------------------------------------------------------
// Verificações automáticas obrigatórias
// -----------------------------------------------------------------------------

function checkDataQuality(input: ReconciliationInput): { divergences: Divergence[]; check: CheckSummary } {
  const divs: Divergence[] = [];
  const accountIds = new Set(input.bankAccounts.map((a) => a.id));
  const cardById = new Map(input.cards.map((c) => [c.id, c]));
  const cardsByName = new Map<string, typeof input.cards>();

  for (const card of input.cards) {
    const key = normalizeFinancialText(card.name);
    const current = cardsByName.get(key) ?? [];
    current.push(card);
    cardsByName.set(key, current);
  }

  for (const [name, cards] of cardsByName) {
    if (name && cards.length > 1) {
      pushIssue(divs, "card", `Nome de cartão duplicado: ${cards[0].name}`, 1, cards.length);
    }
  }

  const periodTxs = input.transactions.filter((t) => t.is_visible !== false && inRange(t.date, input.periodStart, input.periodEnd));
  for (const tx of periodTxs) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) {
      pushIssue(divs, "data_quality", `Transação com data inválida: ${tx.id}`, 1, 0);
    }
    if (!Number.isFinite(Number(tx.amount)) || Number(tx.amount) < 0) {
      pushIssue(divs, "data_quality", `Transação com valor inválido: ${tx.id}`, 0, Number(tx.amount) || 0);
    }
    if (tx.bank_account_id && !accountIds.has(tx.bank_account_id)) {
      pushIssue(divs, "bank_account", `Transação aponta para conta inexistente: ${tx.id}`, 1, 0);
    }
    if (tx.card_id) {
      const card = cardById.get(tx.card_id);
      if (!card) {
        pushIssue(divs, "card", `Transação aponta para cartão inexistente: ${tx.id}`, 1, 0);
      } else if (tx.card && normalizeFinancialText(card.name) !== normalizeFinancialText(tx.card)) {
        pushIssue(divs, "card", `Cartão e card_id não correspondem: ${tx.id}`, 0, 1);
      }
    } else if (tx.card) {
      const matches = cardsByName.get(normalizeFinancialText(tx.card)) ?? [];
      if (matches.length === 0) {
        pushIssue(divs, "card", `Cartão não encontrado para transação: ${tx.card}`, 1, 0);
      } else if (matches.length > 1) {
        pushIssue(divs, "card", `Cartão ambíguo para transação: ${tx.card}`, 1, matches.length);
      }
    }

    const kind = inferTransactionKind(tx as any);
    if ((kind === "income" || kind === "yield" || kind === "refund") && tx.type !== "income") {
      pushIssue(divs, "data_quality", `Natureza e tipo não correspondem: ${tx.id}`, 1, 0);
    }
    if ((kind === "expense" || kind === "card_payment") && tx.type !== "expense") {
      pushIssue(divs, "data_quality", `Natureza e tipo não correspondem: ${tx.id}`, 1, 0);
    }
    if (kind === "transfer" && tx.type !== "income" && tx.type !== "expense") {
      pushIssue(divs, "transfer", `Transferência sem direção válida: ${tx.id}`, 1, 0);
    }
  }

  const periodPayments = input.cardPayments.filter((p) => inRange(p.date, input.periodStart, input.periodEnd));
  for (const payment of periodPayments) {
    if (!cardById.has(payment.card_id)) {
      pushIssue(divs, "card", `Pagamento aponta para cartão inexistente: ${payment.id}`, 1, 0);
    }
    if (payment.bank_account_id && !accountIds.has(payment.bank_account_id)) {
      pushIssue(divs, "bank_account", `Pagamento aponta para conta inexistente: ${payment.id}`, 1, 0);
    }
  }

  return {
    divergences: divs,
    check: summary("data_quality", "Integridade de datas, tipos e vínculos", periodTxs.length + periodPayments.length, divs.length),
  };
}

function checkTransferPairs(input: ReconciliationInput): { divergences: Divergence[]; check: CheckSummary } {
  const divs: Divergence[] = [];
  const groups = new Map<string, { date: string; amount: number; incomes: number; expenses: number; incomeAccounts: Set<string>; expenseAccounts: Set<string> }>();

  const rows = input.transactions.filter((t) => {
    if (t.is_visible === false || !inRange(t.date, input.periodStart, input.periodEnd)) return false;
    return inferTransactionKind(t as any) === "transfer";
  });

  for (const tx of rows) {
    const amount = round2(Number(tx.amount || 0));
    const key = `${tx.date}|${amount.toFixed(2)}`;
    const g = groups.get(key) ?? {
      date: tx.date,
      amount,
      incomes: 0,
      expenses: 0,
      incomeAccounts: new Set<string>(),
      expenseAccounts: new Set<string>(),
    };
    if (tx.type === "income") {
      g.incomes += 1;
      if (tx.bank_account_id) g.incomeAccounts.add(tx.bank_account_id);
    } else if (tx.type === "expense") {
      g.expenses += 1;
      if (tx.bank_account_id) g.expenseAccounts.add(tx.bank_account_id);
    }
    groups.set(key, g);
  }

  for (const g of groups.values()) {
    if (g.incomes !== g.expenses) {
      pushIssue(
        divs,
        "transfer",
        `Transferência sem par em ${g.date} · R$ ${g.amount.toFixed(2).replace(".", ",")}`,
        g.expenses,
        g.incomes,
      );
    }
    if (g.incomes > 0 && g.expenses > 0) {
      const sameAccount = [...g.incomeAccounts].some((id) => g.expenseAccounts.has(id));
      if (sameAccount && g.incomeAccounts.size === 1 && g.expenseAccounts.size === 1) {
        pushIssue(divs, "transfer", `Transferência usa a mesma conta nos dois lados em ${g.date}`, 0, g.amount);
      }
    }
  }

  return { divergences: divs, check: summary("transfer", "Transferências com entrada e saída correspondentes", rows.length, divs.length) };
}

function checkInstallments(input: ReconciliationInput): { divergences: Divergence[]; check: CheckSummary } {
  const divs: Divergence[] = [];
  const groups = new Map<string, typeof input.transactions>();

  for (const tx of input.transactions) {
    if (tx.is_visible === false || !tx.installment_group_id || Number(tx.total_installments || 1) <= 1) continue;
    const current = groups.get(tx.installment_group_id) ?? [];
    current.push(tx);
    groups.set(tx.installment_group_id, current);
  }

  let checked = 0;
  for (const [groupId, rows] of groups) {
    const relevant = rows.some((r) => inRange(r.date, input.periodStart, input.periodEnd) || inRange(r.purchase_date, input.periodStart, input.periodEnd));
    if (!relevant) continue;
    checked += 1;

    const totals = new Set(rows.map((r) => Number(r.total_installments || 0)).filter((n) => n > 0));
    const expectedTotal = Math.max(...totals, 0);
    const numbers = rows.map((r) => Number(r.installment_number || 0)).filter((n) => n > 0);
    const unique = new Set(numbers);

    if (totals.size > 1) {
      pushIssue(divs, "installment", `Parcelamento ${groupId} tem totais inconsistentes`, 1, totals.size);
    }
    const missing = expectedTotal > 0
      ? Array.from({ length: expectedTotal }, (_, i) => i + 1).filter((n) => !unique.has(n))
      : [];
    if (expectedTotal > 0 && (unique.size !== expectedTotal || missing.length > 0)) {
      pushIssue(divs, "installment", `Parcelamento ${groupId} incompleto${missing.length ? ` · faltam ${missing.join(", ")}` : ""}`, expectedTotal, unique.size);
    }
    if (unique.size !== numbers.length) {
      pushIssue(divs, "installment", `Parcelamento ${groupId} possui parcela duplicada`, unique.size, numbers.length);
    }

    const sourceAmount = Math.max(...rows.map((r) => Number(r.installment_source_amount || 0)).filter((n) => n > 0), 0);
    if (sourceAmount > 0 && expectedTotal > 0 && unique.size === expectedTotal) {
      const loaded = round2(rows.reduce((sum, r) => sum + Number(r.amount || 0), 0));
      if (Math.abs(loaded - sourceAmount) > 0.02) {
        pushIssue(divs, "installment", `Parcelamento ${groupId} não fecha com o valor original`, sourceAmount, loaded);
      }
    }
  }

  return { divergences: divs, check: summary("installment", "Sequência e valores dos parcelamentos", checked, divs.length) };
}

function checkRefunds(input: ReconciliationInput): { divergences: Divergence[]; check: CheckSummary } {
  const divs: Divergence[] = [];
  const txById = new Map(input.transactions.map((t) => [t.id, t]));
  const rows = input.cardRefunds.filter((r) => !r.date || inRange(r.date, input.periodStart, input.periodEnd));

  for (const refund of rows) {
    const original = txById.get(refund.transaction_id);
    if (!original) {
      pushIssue(divs, "refund", `Reembolso sem transação original: ${refund.id}`, 1, 0);
    } else if (Math.abs(Number(refund.original_amount || 0) - Number(original.amount || 0)) > 0.02) {
      pushIssue(divs, "refund", `Valor original do reembolso não confere: ${refund.id}`, Number(original.amount || 0), Number(refund.original_amount || 0));
    }

    if (refund.status === "confirmed") {
      if (!refund.refund_transaction_id) {
        pushIssue(divs, "refund", `Reembolso confirmado sem lançamento de devolução: ${refund.id}`, 1, 0);
        continue;
      }
      const refundTx = txById.get(refund.refund_transaction_id);
      if (!refundTx) {
        pushIssue(divs, "refund", `Lançamento do reembolso não foi encontrado: ${refund.id}`, 1, 0);
        continue;
      }
      if (inferTransactionKind(refundTx as any) !== "refund") {
        pushIssue(divs, "refund", `Lançamento vinculado não está marcado como reembolso: ${refund.id}`, 1, 0);
      }
      if (Math.abs(Number(refund.refund_amount || 0) - Number(refundTx.amount || 0)) > 0.02) {
        pushIssue(divs, "refund", `Valor do reembolso confirmado não confere: ${refund.id}`, Number(refund.refund_amount || 0), Number(refundTx.amount || 0));
      }
    }
  }

  return { divergences: divs, check: summary("refund", "Vínculos e valores de reembolsos", rows.length, divs.length) };
}

function compareMaps(
  divs: Divergence[],
  checkType: CheckType,
  labelPrefix: string,
  expectedRows: Array<{ key: string; amount: number }>,
  actualRows: Array<{ key: string; amount: number }>,
) {
  const expected = new Map(expectedRows.map((r) => [normalizeFinancialText(r.key), round2(r.amount)]));
  const actual = new Map(actualRows.map((r) => [normalizeFinancialText(r.key), round2(r.amount)]));
  const keys = new Set([...expected.keys(), ...actual.keys()]);
  for (const key of keys) {
    const e = expected.get(key) ?? 0;
    const a = actual.get(key) ?? 0;
    if (Math.abs(e - a) > 0.02) {
      pushIssue(divs, checkType, `${labelPrefix}: ${key || "sem categoria"}`, e, a);
    }
  }
}

function checkCanonicalSystem(input: ReconciliationInput): { divergences: Divergence[]; check: CheckSummary } {
  const divs: Divergence[] = [];
  let checked = 0;

  for (const facts of input.canonicalFacts) {
    const local = computeMonthlyFinancialSummary(input.transactions as any, input.cards, facts.month);
    checked += 3;
    if (Math.abs(local.income - Number(facts.income || 0)) > 0.02) {
      pushIssue(divs, "system", `Receitas ${facts.month}: motor local × fonte canônica`, Number(facts.income || 0), local.income);
    }
    if (Math.abs(local.expense - Number(facts.expense || 0)) > 0.02) {
      pushIssue(divs, "system", `Despesas ${facts.month}: motor local × fonte canônica`, Number(facts.expense || 0), local.expense);
    }
    if (Math.abs(local.cardExpenseComponent - Number(facts.cardExpenseComponent || 0)) > 0.02) {
      pushIssue(divs, "system", `Cartões em DESPESAS ${facts.month}: motor local × fonte canônica`, Number(facts.cardExpenseComponent || 0), local.cardExpenseComponent);
    }

    const localCategories = computeMonthlyCategoryTotals(input.transactions as any, facts.month);
    compareMaps(
      divs,
      "system",
      `Categoria ${facts.month}`,
      (facts.categories || []).map((r) => ({ key: r.category, amount: Number(r.amount || 0) })),
      localCategories.map((r) => ({ key: r.category, amount: Number(r.amount || 0) })),
    );
    checked += new Set([...(facts.categories || []).map((r) => normalizeFinancialText(r.category)), ...localCategories.map((r) => normalizeFinancialText(r.category))]).size;

    const localCards = computeCardConsistency(input.transactions as any, input.cards, facts.month).cards;
    compareMaps(
      divs,
      "system",
      `Cartão ${facts.month}`,
      (facts.cards || []).map((r) => ({ key: r.card, amount: Number(r.amount || 0) })),
      localCards.map((r) => ({ key: r.card, amount: Number(r.amount || 0) })),
    );
    checked += new Set([...(facts.cards || []).map((r) => normalizeFinancialText(r.card)), ...localCards.map((r) => normalizeFinancialText(r.card))]).size;
  }

  return { divergences: divs, check: summary("system", "Home/Transações/Insights × fonte financeira canônica", checked, divs.length) };
}

// -----------------------------------------------------------------------------
// Regras adicionais configuráveis pelo usuário
// -----------------------------------------------------------------------------

function checkCustomCards(input: ReconciliationInput): Divergence[] {
  const divs: Divergence[] = [];
  for (const card of input.cards) {
    const rule = findRule(input.rules, "card", card.id);
    if (!rule) continue;

    if (rule.rule_kind === "zero") {
      const expected = 0;
      const actual = round2(card.used);
      const delta = round2(actual - expected);
      if (!withinTolerance(delta, expected, rule.tolerance_kind, rule.tolerance_value)) {
        pushIssue(divs, "card", `${card.name} (used deve ser 0)`, expected, actual, rule.id);
      }
      continue;
    }

    const txs = input.transactions.filter((t) => {
      if (t.is_visible === false) return false;
      if (!inRange(t.date, input.periodStart, input.periodEnd)) return false;
      return t.card_id === card.id || (!t.card_id && normalizeFinancialText(t.card) === normalizeFinancialText(card.name));
    });
    let spent = 0;
    for (const tx of txs) {
      const kind = inferTransactionKind(tx as any);
      if (kind === "expense") spent += Number(tx.amount || 0);
      else if (kind === "refund") spent -= Number(tx.amount || 0);
    }
    const paid = input.cardPayments
      .filter((p) => p.card_id === card.id && inRange(p.date, input.periodStart, input.periodEnd))
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const expected = round2(spent - paid);
    const actual = round2(card.used);
    const delta = round2(actual - expected);
    if (!withinTolerance(delta, expected, rule.tolerance_kind, rule.tolerance_value)) {
      pushIssue(divs, "card", card.name, expected, actual, rule.id);
    }
  }
  return divs;
}

function checkCustomInvoices(input: ReconciliationInput): Divergence[] {
  const divs: Divergence[] = [];
  for (const card of input.cards) {
    const rule = findRule(input.rules, "invoice", card.id);
    if (!rule) continue;

    const months = new Set<string>();
    for (const tx of input.transactions) {
      if (tx.card_id !== card.id && (tx.card_id || normalizeFinancialText(tx.card) !== normalizeFinancialText(card.name))) continue;
      const cycle = getBillingCycleMonthKey(tx.date, tx.created_at || `${tx.date}T12:00:00`, card.closing_day);
      months.add(cycle);
    }
    for (const payment of input.cardPayments.filter((p) => p.card_id === card.id)) {
      months.add(monthKey(payment.target_period || payment.date));
    }

    for (const ym of months) {
      if (ym < input.periodStart.slice(0, 7) || ym > input.periodEnd.slice(0, 7)) continue;
      const spent = input.transactions
        .filter((tx) => {
          if (tx.is_visible === false) return false;
          if (tx.card_id !== card.id && (tx.card_id || normalizeFinancialText(tx.card) !== normalizeFinancialText(card.name))) return false;
          return getBillingCycleMonthKey(tx.date, tx.created_at || `${tx.date}T12:00:00`, card.closing_day) === ym;
        })
        .reduce((sum, tx) => {
          const kind = inferTransactionKind(tx as any);
          if (kind === "expense") return sum + Number(tx.amount || 0);
          if (kind === "refund") return sum - Number(tx.amount || 0);
          return sum;
        }, 0);
      const paid = input.cardPayments
        .filter((p) => p.card_id === card.id && monthKey(p.target_period || p.date) === ym)
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const expected = 0;
      const actual = round2(spent - paid);
      const delta = round2(actual);
      if (!withinTolerance(delta, expected, rule.tolerance_kind, rule.tolerance_value)) {
        pushIssue(divs, "invoice", `${card.name} ${ym}`, expected, actual, rule.id);
      }
    }
  }
  return divs;
}

function checkCustomBudgets(input: ReconciliationInput): Divergence[] {
  const divs: Divergence[] = [];
  for (const b of input.budgets) {
    const rule = findRule(input.rules, "budget", b.id);
    if (!rule) continue;
    const spent = input.transactions
      .filter((t) => {
        if (t.is_visible === false || inferTransactionKind(t as any) !== "expense") return false;
        return normalizeFinancialText(String(t.category || "").split(">")[0]) === normalizeFinancialText(b.category)
          && inRange(t.purchase_date || t.date, b.period_start, b.period_end)
          && inRange(t.purchase_date || t.date, input.periodStart, input.periodEnd);
      })
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const expected = round2(b.amount);
    const actual = round2(spent);
    const delta = round2(actual - expected);
    if (!withinTolerance(delta, expected, rule.tolerance_kind, rule.tolerance_value)) {
      pushIssue(divs, "budget", b.category, expected, actual, rule.id);
    }
  }
  return divs;
}

export function runReconciliation(input: ReconciliationInput): RunResult {
  const automatic = [
    checkDataQuality(input),
    checkTransferPairs(input),
    checkInstallments(input),
    checkRefunds(input),
    checkCanonicalSystem(input),
  ];

  const custom = [
    ...checkCustomCards(input),
    ...checkCustomInvoices(input),
    ...checkCustomBudgets(input),
  ];

  const divergences = [...automatic.flatMap((x) => x.divergences), ...custom];
  const counts_by_check: Record<CheckType, number> = {
    bank_account: 0,
    card: 0,
    invoice: 0,
    budget: 0,
    transfer: 0,
    installment: 0,
    data_quality: 0,
    refund: 0,
    system: 0,
  };

  let total = 0;
  for (const d of divergences) {
    counts_by_check[d.check_type]++;
    total += Math.abs(d.delta);
  }

  const checks = automatic.map((x) => x.check);
  if (input.rules.some((r) => r.enabled)) {
    checks.push(summary("card", "Regras adicionais configuradas", input.rules.filter((r) => r.enabled).length, custom.length));
  }

  return {
    verification_version: 2,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    divergences,
    total_divergence_amount: round2(total),
    counts_by_check,
    checks,
  };
}
