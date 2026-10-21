import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/routes/transactions.tsx"), "utf8");

describe("Parcela pendente: efetivar sem editar o parcelamento", () => {
  it("tocar na parcela pendente na busca abre a confirmação de efetivação", () => {
    const search = source.slice(source.indexOf("const results = transactions.filter(tx => {"));
    expect(search).toContain('if (tx.transaction_status === "pending") openPostTransaction(tx);');
    expect(search).toContain("else handleEdit(tx);");
    expect(search).toContain('onPost={tx.transaction_status === "pending"');
  });
  it("editor permite ir para efetivação sem salvar valor, quantidade ou data de outra parcela", () => {
    expect(source).toContain('editTx?.transaction_status === "pending"');
    expect(source).toContain("Efetivar esta parcela");
    expect(source).toContain('transactions.find((row) => row.id === editTx.id)');
    expect(source).toContain("original.transaction_status !== \"pending\"");
    expect(source).toContain("openPostTransaction(original);");
  });
  it("a efetivação exige conta selecionada e é limitada à parcela pendente", () => {
    const start = source.indexOf("const openPostTransaction =");
    const end = source.indexOf("const openDeleteFromEdit =", start);
    const post = source.slice(start, end);
    expect(post).toContain('setPostAccountId("");');
    expect(post).toContain('if (!postTarget || !postAccountId || postingPending) return');
    expect(post).toContain('.eq("id", postTarget.id)');
    expect(post).toContain('.eq("transaction_status", "pending")');
    expect(post).toContain(".maybeSingle()");
    expect(post).toContain('data.bank_account_id !== postAccountId');
  });
});
