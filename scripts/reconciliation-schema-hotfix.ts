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

      const original = code;

      let next = code.replace(
        '.select("id,date,created_at,amount,type,is_visible,bank_account_id,card,category,transfer_direction")',
        '.select("id,date,transaction_date,created_at,amount,type,is_visible,bank_account_id,card,category,transaction_kind")',
      );

      next = next.replace(
        '.gte("date", periodStart)\n      .lte("date", periodEnd)',
        '.gte("transaction_date", periodStart)\n      .lte("transaction_date", periodEnd)',
      );

      next = next.replace(
        'date: String(r.date),',
        'date: String(r.transaction_date ?? r.date),',
      );

      next = next.replace(
        'transfer_direction: r.transfer_direction,',
        'transfer_direction: r.transaction_kind === "transfer" ? (r.type === "income" ? "in" : r.type === "expense" ? "out" : null) : null,',
      );

      if (next === original) {
        throw new Error("Reconciliation schema hotfix did not match the expected source");
      }

      return { code: next, map: null };
    },
  };
}
