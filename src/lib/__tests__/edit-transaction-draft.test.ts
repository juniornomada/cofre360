import { describe, it, expect, beforeEach } from "vitest";
import {
  loadEditDraft,
  saveEditDraft,
  clearEditDraft,
  clearAllEditDrafts,
} from "@/lib/edit-transaction-draft";

beforeEach(() => {
  window.localStorage.clear();
});

describe("edit-transaction-draft", () => {
  it("returns null when no draft exists", () => {
    expect(loadEditDraft("tx-1")).toBeNull();
  });

  it("saves and restores a draft with mode + fields", () => {
    saveEditDraft("tx-1", {
      fields: { amount: 123.45, total_installments: 3, category: "Alimentação" },
      mode: "fixed",
    });
    const d = loadEditDraft("tx-1");
    expect(d).not.toBeNull();
    expect(d!.mode).toBe("fixed");
    expect(d!.fields.amount).toBe(123.45);
    expect(d!.fields.total_installments).toBe(3);
    expect(d!.fields.category).toBe("Alimentação");
    expect(typeof d!.savedAt).toBe("number");
  });

  it("isolates drafts per transaction id", () => {
    saveEditDraft("a", { fields: { amount: 10 }, mode: "divide" });
    saveEditDraft("b", { fields: { amount: 20 }, mode: "fixed" });
    expect(loadEditDraft("a")!.fields.amount).toBe(10);
    expect(loadEditDraft("b")!.fields.amount).toBe(20);
  });

  it("clears a specific draft", () => {
    saveEditDraft("a", { fields: { amount: 10 }, mode: "divide" });
    saveEditDraft("b", { fields: { amount: 20 }, mode: "fixed" });
    clearEditDraft("a");
    expect(loadEditDraft("a")).toBeNull();
    expect(loadEditDraft("b")).not.toBeNull();
  });

  it("expires drafts older than the TTL", () => {
    saveEditDraft("old", { fields: { amount: 5 }, mode: "divide" }, 1_000);
    // Rewrite the savedAt to be in the past
    const raw = JSON.parse(window.localStorage.getItem("edit-tx-drafts:v1")!);
    raw.old.savedAt = Date.now() - 10_000;
    window.localStorage.setItem("edit-tx-drafts:v1", JSON.stringify(raw));
    expect(loadEditDraft("old", 1_000)).toBeNull();
  });

  it("survives corrupted localStorage payloads", () => {
    window.localStorage.setItem("edit-tx-drafts:v1", "{not json");
    expect(loadEditDraft("x")).toBeNull();
    // Save still works after corruption
    saveEditDraft("x", { fields: { amount: 1 }, mode: "divide" });
    expect(loadEditDraft("x")!.fields.amount).toBe(1);
  });

  it("clearAllEditDrafts wipes storage", () => {
    saveEditDraft("a", { fields: { amount: 1 }, mode: "divide" });
    clearAllEditDrafts();
    expect(loadEditDraft("a")).toBeNull();
  });

  it("restaura modo + valores digitados ao reabrir edição de RECEITA parcelada no cartão", () => {
    // Simula o usuário abrindo a edição de uma parcela de RECEITA (estorno em
    // 3x de R$ 900), alternando para modo "fixed" e alterando alguns campos
    // antes de fechar o diálogo sem salvar.
    const txId = "tx-income-installment-1";
    saveEditDraft(txId, {
      mode: "fixed",
      fields: {
        type: "income",
        icon: "💰",
        name: "Estorno cashback",
        category: "Receita > Estorno",
        date: "2026-08-15",
        amount: 300, // valor por parcela no modo fixed
        total_installments: 3,
        installment_number: 1,
        card: "Nubank",
        bank_account_id: null,
      },
    });

    // Reabrindo o diálogo (simulado): draft correto retorna com mode + fields
    const restored = loadEditDraft(txId);
    expect(restored).not.toBeNull();
    expect(restored!.mode).toBe("fixed");
    expect(restored!.fields.type).toBe("income");
    expect(restored!.fields.amount).toBe(300);
    expect(restored!.fields.total_installments).toBe(3);
    expect(restored!.fields.installment_number).toBe(1);
    expect(restored!.fields.category).toBe("Receita > Estorno");
    expect(restored!.fields.icon).toBe("💰");
    expect(restored!.fields.name).toBe("Estorno cashback");
    expect(restored!.fields.date).toBe("2026-08-15");
    expect(restored!.fields.card).toBe("Nubank");

    // Segunda edição na mesma sessão: usuário alterna para "divide" e ajusta
    // o total. Ao reabrir novamente, o novo estado deve prevalecer.
    saveEditDraft(txId, {
      mode: "divide",
      fields: {
        type: "income",
        icon: "💰",
        name: "Estorno cashback",
        category: "Receita > Estorno",
        date: "2026-08-15",
        amount: 900, // agora total no modo divide
        total_installments: 3,
        installment_number: 1,
        card: "Nubank",
        bank_account_id: null,
      },
    });
    const reopened = loadEditDraft(txId);
    expect(reopened!.mode).toBe("divide");
    expect(reopened!.fields.amount).toBe(900);
    expect(reopened!.fields.type).toBe("income");

    // Isolamento: um draft de despesa em outro tx não contamina o de receita.
    saveEditDraft("tx-expense-99", {
      mode: "fixed",
      fields: { type: "expense", amount: 50, total_installments: 2 },
    });
    expect(loadEditDraft(txId)!.fields.type).toBe("income");
    expect(loadEditDraft(txId)!.fields.amount).toBe(900);
  });
});

