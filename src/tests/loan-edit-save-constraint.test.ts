import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Editar transação de empréstimo", () => {
  const migration = readFileSync(resolve(process.cwd(),
    "supabase/migrations/20261114170524_loan_movement_constraint.sql"), "utf8");
  const editor = readFileSync(resolve(process.cwd(),
    "src/routes/transactions.tsx"), "utf8");

  it("permite o novo tipo canônico sem remover os oito anteriores", () => {
    const kinds = ["expense", "income", "transfer", "card_payment",
      "refund", "adjustment", "investment_movement", "yield", "loan_movement"];
    for (const kind of kinds) expect(migration).toContain(`'${kind}'::text`);
    expect(migration).toContain("transactions_transaction_kind_check");
    expect(migration).toContain("alter table public.transactions");
  });

  it("preserva edição e rascunho em falha, evitando perder valor e conta", () => {
    expect(editor).toContain("if (savedSuccessfully) {");
    expect(editor).toContain("setShowEditDialog(false)");
    expect(editor).toContain("Não foi possível salvar:");
    expect(editor).toContain("Falha ao salvar edição de transação:");
    expect(editor).toContain('await Promise.all([fetchTransactions(), fetchBankAccounts()])');
  });

  it("não migra lançamentos nem altera saldos do usuário", () => {
    expect(migration).not.toMatch(/\bupdate\s+public\.transactions\b/i);
    expect(migration).not.toMatch(/\bdelete\s+from\s+public\.transactions\b/i);
  });
});
