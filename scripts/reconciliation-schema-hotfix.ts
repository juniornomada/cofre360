import type { Plugin } from "vite";

/**
 * Keeps the reconciliation loader aligned with the canonical transactions schema.
 *
 * The legacy reconciliation code still referenced the removed `transfer_direction`
 * column and filtered the legacy text `date` field. Transactions now expose
 * `transaction_kind` plus the canonical `transaction_date` date column, so this
 * transform updates the server function during dev/build until the legacy module
 * is fully refactored.
 */
export function reconciliationSchemaHotfix(): Plugin {
  return {
    name: "cofre360-reconciliation-schema-hotfix",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("/src/lib/reconciliation/reconciliation.functions.ts")) return null;

      let next = code;

      next = next.replace(
        /\.select\((["'])id,date,created_at,amount,type,is_visible,bank_account_id,card,category,transfer_direction\1\)/g,
        '.select("id,date,transaction_date,created_at,amount,type,is_visible,bank_account_id,card,category,transaction_kind")',
      );

      next = next.replace(
        /\.gte\((["'])date\1,\s*periodStart\)\s*\.lte\((["'])date\2,\s*periodEnd\)/g,
        '.gte("transaction_date", periodStart)\n      .lte("transaction_date", periodEnd)',
      );

      next = next.replace(
        /date:\s*String\(r\.date\),/g,
        'date: String(r.transaction_date ?? r.date),',
      );

      next = next.replace(
        /transfer_direction:\s*r\.transfer_direction,/g,
        'transfer_direction: r.transaction_kind === "transfer" ? (r.type === "income" ? "in" : r.type === "expense" ? "out" : null) : null,',
      );

      // Vite can ask a pre-transform plugin to process the same module more than once.
      // Keep the transform idempotent instead of failing the build on the second pass.
      if (next === code) return null;

      return { code: next, map: null };
    },
  };
}
