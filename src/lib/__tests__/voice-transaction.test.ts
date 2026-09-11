import { describe, expect, it } from "vitest";
import { parseVoiceTransaction, voiceAccountNamesMatch } from "@/lib/voice-transaction";

// Regressões do fluxo de voz: valores, conta, referência e categoria inferida.
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

  it("entende rendimento, conta com percentual e valor decimal com ponto", () => {
    const draft = parseVoiceTransaction(
      "Lance um rendimento na conta Cofrinho 140% no valor de 1.06",
      now,
    );

    expect(draft.type).toBe("income");
    expect(draft.name).toBe("Rendimento");
    expect(draft.category).toBe("Receita > Juros");
    expect(draft.icon).toBe("📈");
    expect(draft.bankAccount).toBe("Cofrinho 140%");
    expect(draft.card).toBeNull();
    expect(draft.amount).toBe(1.06);
  });

  it("entende 31 centavos como R$ 0,31 em comando estruturado", () => {
    const draft = parseVoiceTransaction("Receita, nome, rendimento, valor, 31 centavos, conta, Cofrinho 140", now);
    expect(draft.type).toBe("income");
    expect(draft.name).toBe("Rendimento");
    expect(draft.category).toBe("Receita > Juros");
    expect(draft.amount).toBe(0.31);
    expect(draft.bankAccount).toBe("Cofrinho 140");
  });

  it("aceita 0.31 e 0,31 como o mesmo valor", () => {
    expect(parseVoiceTransaction("Receita nome rendimento valor 0.31 conta Cofrinho 140", now).amount).toBe(0.31);
    expect(parseVoiceTransaction("Receita nome rendimento valor 0,31 conta Cofrinho 140%", now).amount).toBe(0.31);
  });

  it("considera Cofrinho 140 e Cofrinho 140% a mesma conta", () => {
    expect(voiceAccountNamesMatch("Cofrinho 140", "Cofrinho 140%")).toBe(true);
    expect(voiceAccountNamesMatch("Cofrinho 140 por cento", "Cofrinho 140%")).toBe(true);
  });

  it("coloca referência entre parênteses no nome", () => {
    expect(parseVoiceTransaction("Receita, nome Salário Junior, referência mãe, valor 1000 reais", now).name)
      .toBe("Salário Junior (mãe)");
    expect(parseVoiceTransaction("Despesa, nome Pedágio, referência pai, valor 20 reais", now).name)
      .toBe("Pedágio (pai)");
    expect(parseVoiceTransaction("Despesa nome Posto de Gasolina referência Spacefox valor 100 reais", now).name)
      .toBe("Posto de Gasolina (Spacefox)");
  });

  it("mantém o nome normal quando não há referência", () => {
    expect(parseVoiceTransaction("Receita, nome Salário Junior, valor 1000 reais", now).name)
      .toBe("Salário Junior");
  });

  it("entende referência informal no próprio nome", () => {
    expect(parseVoiceTransaction("Despesa, nome, Posto de Gasolina do Creta, valor, 100 reais", now).name)
      .toBe("Posto de Gasolina (Creta)");
    expect(parseVoiceTransaction("Despesa, nome, Posto de Gasolina Spacefox, valor, 100 reais", now).name)
      .toBe("Posto de Gasolina (Spacefox)");
    expect(parseVoiceTransaction("Receita, nome, Salário Junior da mãe, valor, 1000 reais", now).name)
      .toBe("Salário Junior (mãe)");
    expect(parseVoiceTransaction("Despesa, nome, Pedágio do pai, valor, 20 reais", now).name)
      .toBe("Pedágio (pai)");
  });

  it("não cria referência informal quando o sufixo não é conhecido", () => {
    expect(parseVoiceTransaction("Receita, nome, Salário Carol, valor, 2000 reais", now).name)
      .toBe("Salário Carol");
    expect(parseVoiceTransaction("Receita, nome, Salário Junior, valor, 2000 reais", now).name)
      .toBe("Salário Junior");
  });

  it("infere categorias seguras quando a transação ainda não tem histórico", () => {
    const salary = parseVoiceTransaction("Receita, nome, Salário Junior da mãe, valor, 1000 reais", now);
    expect(salary.category).toBe("Receita > Salário");
    expect(salary.icon).toBe("💼");

    const fuel = parseVoiceTransaction("Despesa, nome, Posto de Gasolina do Creta, valor, 100 reais", now);
    expect(fuel.category).toBe("Transporte > Combustível");
    expect(fuel.icon).toBe("⛽");

    const toll = parseVoiceTransaction("Despesa, nome, Pedágio do pai, valor, 20 reais", now);
    expect(toll.category).toBe("Transporte > Pedágio");
    expect(toll.icon).toBe("🛣️");

    const unknown = parseVoiceTransaction("Despesa, nome, Floricultura Central, valor, 80 reais", now);
    expect(unknown.category).toBe("Outros > Outros");
    expect(unknown.icon).toBe("📄");
  });

  it("distingue restaurante de delivery na inferência sem histórico", () => {
    expect(parseVoiceTransaction("Despesa, nome, Restaurante Central, valor, 60 reais", now).category)
      .toBe("Alimentação > Restaurante");
    expect(parseVoiceTransaction("Despesa, nome, iFood, valor, 45 reais", now).category)
      .toBe("Alimentação > Delivery");
  });
});
