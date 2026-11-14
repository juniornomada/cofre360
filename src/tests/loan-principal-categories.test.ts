import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { categoryTree, getCategoryValue, getCategoryIcon } from "@/lib/categories";
import { inferTransactionKind, computeMonthlyFinancialSummary } from "@/lib/financial-engine";
import { isTechnicalTransactionCategory } from "@/lib/transaction-category-navigation";

const received = "Empréstimos recebidos > Entrada de empréstimo";
const returned = "Devolução de empréstimos > Principal devolvido";
const interest = "Dívidas/Parcelas > Juros de empréstimo";

describe("Empréstimo recebido e devolução: classificação patrimonial", () => {
  it("oferece categorias separadas na aba Receita e Despesa", () => {
    expect(categoryTree.find(g => g.label === "Empréstimos recebidos")?.type).toBe("income");
    expect(categoryTree.find(g => g.label === "Devolução de empréstimos")?.type).toBe("expense");
    expect(categoryTree.find(g => g.label === "Dívidas/Parcelas")?.subcategories.some(s => s.label === "Juros de empréstimo")).toBe(true);
    expect(getCategoryValue("Empréstimos recebidos", "Entrada de empréstimo")).toBe(received);
    expect(getCategoryValue("Devolução de empréstimos", "Principal devolvido")).toBe(returned);
    expect(getCategoryIcon(received)).toBe("🤝");
    expect(getCategoryIcon(returned)).toBe("↩️");
  });
  it("infere movimentação patrimonial para o principal e despesa real para juros", () => {
    expect(inferTransactionKind({ type: "income", category: received, transaction_kind: null })).toBe("loan_movement");
    expect(inferTransactionKind({ type: "expense", category: returned, transaction_kind: null })).toBe("loan_movement");
    expect(inferTransactionKind({ type: "expense", category: interest, transaction_kind: null })).toBe("expense");
    expect(isTechnicalTransactionCategory("Devolução de empréstimos")).toBe(true);
  });
  it("emprestou R$ 1.000 e devolveu R$ 1.000 sem alterar resultado financeiro", () => {
    const rows = [
      { id: "entrada", name: "Empréstimo (mãe)", amount: 1000, date: "2026-11-10", type: "income", category: received, transaction_kind: "loan_movement", bank_account_id: "banco" },
      { id: "devolucao", name: "Devolução (mãe)", amount: 1000, date: "2026-11-13", type: "expense", category: returned, transaction_kind: "loan_movement", bank_account_id: "banco" },
    ];
    expect(computeMonthlyFinancialSummary(rows, [], "2026-11")).toMatchObject({ income: 0, expense: 0, result: 0 });
    const withInterest = [...rows, { id: "juros", amount: 50, date: "2026-11-13", type: "expense", category: interest, bank_account_id: "banco" }];
    expect(computeMonthlyFinancialSummary(withInterest, [], "2026-11")).toMatchObject({ income: 0, expense: 50, result: -50 });
  });
  it("mantém saldos e histórico, mas exclui principal dos relatórios", () => {
    const db = readFileSync(resolve(process.cwd(), "supabase/migrations/20261114143000_loan_principal_classification.sql"), "utf8");
    const quick = readFileSync(resolve(process.cwd(), "src/components/QuickAddTransactionDialog.tsx"), "utf8");
    const home = readFileSync(resolve(process.cwd(), "src/routes/home.tsx"), "utf8");
    const transactions = readFileSync(resolve(process.cwd(), "src/routes/transactions.tsx"), "utf8");
    expect(db).toContain("return 'loan_movement'");
    expect(quick).toContain("isLoanPrincipal");
    expect(quick).toContain("newTx.bank_account_id");
    expect(quick).toContain("newTx.card");
    expect(home).toContain('normalizedCategory === "emprestimos recebidos"');
    expect(home).toContain('normalizedCategory === "devolucao de emprestimos"');
    expect(transactions).toContain('group === "Empréstimos recebidos"');
    expect(transactions).toContain('group === "Devolução de empréstimos"');
  });
});
