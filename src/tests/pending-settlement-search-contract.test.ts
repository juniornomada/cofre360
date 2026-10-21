import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = () => readFileSync(resolve(process.cwd(), "src/routes/transactions.tsx"), "utf8");

describe("Busca global e confirmação financeira", () => {
  it("busca de transações abre fluxo de efetivar em vez de somente editar", () => {
    const content = page();
    const searchSection = content.slice(content.indexOf("const results = transactions.filter(tx => {"));
    expect(searchSection).toContain("onPost={tx.transaction_status === \"pending\"");
    expect(searchSection).toContain("setShowGlobalSearch(false); openPostTransaction(tx);");
    expect(searchSection).not.toContain('<button\n                  key={tx.id}');
  });
  it("sempre exige escolher uma conta e só confirma se uma linha foi atualizada", () => {
    const content = page();
    const section = content.slice(content.indexOf("const openPostTransaction ="), content.indexOf("const openDeleteFromEdit ="));
    expect(section).toContain('setPostAccountId("");');
    expect(section).not.toContain("setPostAccountId(tx.bank_account_id");
    expect(section).toContain('bankAccounts.some((account) => account.id === postAccountId)');
    expect(section).toContain('.eq("transaction_status", "pending")');
    expect(section).toContain('.select("id, transaction_status, bank_account_id")');
    expect(section).toContain(".maybeSingle()");
    expect(section).toContain('data.bank_account_id !== postAccountId');
  });
});
