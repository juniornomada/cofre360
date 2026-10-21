import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/routes/transactions.tsx"), "utf8");

describe("Transações — salvar edição de parcelas apenas uma vez", () => {
  it("passa a confirmação de escopo diretamente para a rotina de gravação", () => {
    expect(source).toContain(
      'const handleSaveEdit = async (approvedScope?: { scope: "single" | "all"; changes: string[] }) =>',
    );
    expect(source).toContain("if (editTx.installment_group_id && !approvedScope)");
    expect(source).toContain("void handleSaveEdit({ scope: updateScope, changes: [...scopeChanges] })");

    // setState followed by a setTimeout invoked the callback from the prior
    // render, which still saw scopeConfirmed=false and reopened the same modal.
    expect(source).not.toContain("scopeConfirmed");
    expect(source).not.toMatch(/setTimeout\s*\(\s*\(\)\s*=>\s*\{?\s*handleSaveEdit\(/);
  });

  it("usa exatamente o escopo confirmado ao propagar parcelas ou datas", () => {
    expect(source).toContain('const applyToAll = (approvedScope?.scope ?? updateScope) === "all"');
    expect(source).toContain("const confirmedChanges = approvedScope?.changes ?? scopeChanges");
    expect(source).toContain("updateAllInGroup: applyToAll");
    expect(source).toContain('syncDates: applyToAll && confirmedChanges.includes("Data")');
  });

  it("bloqueia duplo clique durante uma gravação e mantém feedback visual", () => {
    expect(source).toContain("if (!editTx || savingEditRef.current) return");
    expect(source).toContain("savingEditRef.current = true");
    expect(source).toContain("savingEditRef.current = false");
    expect(source).toContain("disabled={savingEdit ||");
    expect(source).toContain('savingEdit ? "Salvando..." : "Salvar alterações"');
    expect(source).toContain('savingEdit ? "Salvando..." : "Confirmar e Salvar"');
    expect(source).toContain("if (savingEditRef.current) return");
  });

  it("mantém o diálogo de escopo somente quando há alterações estruturais", () => {
    expect(source).toContain("const { structural } = splitInstallmentChanges(changes)");
    expect(source).toContain("if (structural.length > 0)");
    expect(source).toContain("setShowUpdateScopeDialog(true)");
  });
});
