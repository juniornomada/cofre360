import { describe, expect, it } from "vitest";
import { parseVoiceTransaction } from "@/lib/voice-transaction";

describe("parseVoiceTransaction", () => {
  const now = new Date(2026, 8, 8, 10, 0, 0);

  it("separa nome, valor por extenso, cartão e parcelas em fala longa", () => {
    const draft = parseVoiceTransaction(
      "Quero adicionar uma despesa. O nome da transação é Auto Mecânica Romanoski, no valor de cento e vinte reais, no cartão Porto Bank, em 3 parcelas, hoje.",
      now,
    );

    expect(draft.name).toBe("Auto Mecânica Romanoski");
    expect(draft.amount).toBe(120);
    expect(draft.card).toBe("Porto Bank");
    expect(draft.installmentCount).toBe(3);
    expect(draft.category).toBe("Transporte > Manutenção");
  });

  it("entende valor por extenso antes do estabelecimento", () => {
    const draft = parseVoiceTransaction("Gastei cento e cinquenta reais na Padaria Central ontem", now);

    expect(draft.amount).toBe(150);
    expect(draft.name).toBe("Padaria Central");
    expect(draft.category).toBe("Alimentação > Padaria/Café");
    expect(draft.date).toBe("07-09-2026");
  });

  it("entende valor numérico e nome antes do valor", () => {
    const draft = parseVoiceTransaction("Comprei na Loja Central por R$ 1.299,90 em 4 parcelas hoje", now);

    expect(draft.name).toBe("Loja Central");
    expect(draft.amount).toBe(1299.9);
    expect(draft.installmentCount).toBe(4);
  });

  it("não transforma uma fala longa sem estrutura em nome da transação", () => {
    const draft = parseVoiceTransaction(
      "Eu estava pensando em organizar minhas contas e queria aproveitar para falar bastante sobre uma compra mas não informei claramente os campos da transação",
      now,
    );

    expect(draft.name).toBe("Transação por voz");
    expect(draft.amount).toBe(0);
  });
});
