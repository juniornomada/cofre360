import type { Plugin } from "vite";

/**
 * Keeps the reconciliation loader aligned with the canonical production schema.
 *
 * Reconciliation is legacy code that still expects a few columns that no longer
 * exist in production. This pre-transform keeps the runtime query compatible
 * while preserving the existing reconciliation engine contract.
 */
export function reconciliationSchemaHotfix(): Plugin {
  return {
    name: "cofre360-reconciliation-schema-hotfix",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("/src/lib/reconciliation/reconciliation.functions.ts")) return null;

      let next = code;

      // Transactions: canonical date + transaction kind instead of the removed
      // transfer_direction column.
      next = next.replace(
        /\.select\((["'])id,date,created_at,amount,type,is_visible,bank_account_id,card,category,transfer_direction\1\)/g,
        '.select("id,date,transaction_date,created_at,amount,type,is_visible,bank_account_id,card,category,transaction_kind")',
      );

      next = next.replace(
        /\.gte\((["'])date\1,\s*periodStart\)\s*\.lte\((["'])date\2,\s*periodEnd\)/g,
        '.gte("transaction_date", periodStart)\n      .lte("transaction_date", periodEnd)',
      );

      next = next.replace(
        /(transactions:\s*\(txRes\.data\s*\?\?\s*\[\]\)\.map\(\(r:\s*any\)\s*=>\s*\(\{[\s\S]*?\bid:\s*r\.id,\s*)date:\s*String\(r\.date\),/,
        '$1date: String(r.transaction_date ?? r.date),',
      );

      next = next.replace(
        /transfer_direction:\s*r\.transfer_direction,/g,
        'transfer_direction: r.transaction_kind === "transfer" ? (r.type === "income" ? "in" : r.type === "expense" ? "out" : null) : null,',
      );

      // Card payments: production uses paid_at/target_period, not date.
      next = next.replace(
        /\.from\((["'])card_payments\1\)\.select\((["'])id,card_id,amount,date\2\)/g,
        '.from("card_payments").select("id,card_id,amount,paid_at,target_period")',
      );

      next = next.replace(
        /(cardPayments:\s*\(payRes\.data\s*\?\?\s*\[\]\)\.map\(\(r:\s*any\)\s*=>\s*\(\{[\s\S]*?\bamount:\s*Number\(r\.amount\s*\?\?\s*0\),\s*)date:\s*String\(r\.date\),/,
        '$1date: String(r.paid_at ?? r.target_period),',
      );

      // Budget categories: production stores the configured amount in budget_limit
      // and does not persist period_start/period_end on each category row.
      next = next.replace(
        /\.from\((["'])budget_categories\1\)\s*\.select\((["'])id,category,amount,period_start,period_end\2\)/g,
        '.from("budget_categories")\n      .select("id,category,budget_limit")',
      );

      next = next.replace(
        /(budgets:\s*\(budRes\.data\s*\?\?\s*\[\]\)\.map\(\(r:\s*any\)\s*=>\s*\(\{[\s\S]*?\bcategory:\s*r\.category,\s*)amount:\s*Number\(r\.amount\s*\?\?\s*0\),\s*period_start:\s*r\.period_start\s*\?\?\s*periodStart,\s*period_end:\s*r\.period_end\s*\?\?\s*periodEnd,/,
        '$1amount: Number(r.budget_limit ?? 0),\n      period_start: periodStart,\n      period_end: periodEnd,',
      );

      // Vite can ask a pre-transform plugin to process the same module more than once.
      // Keep the transform idempotent instead of failing the build on the second pass.
      if (next === code) return null;

      return { code: next, map: null };
    },
  };
}
