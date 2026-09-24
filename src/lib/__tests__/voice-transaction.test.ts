import { describe, expect, it } from "vitest";
import { parseVoiceTransaction, voiceAccountNamesMatch, voiceCardNamesMatch } from "@/lib/voice-transaction";

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


  it("considera número falado e número salvo como a mesma conta", () => {
    expect(voiceAccountNamesMatch("noventa e nove", "99")).toBe(true);
    expect(voiceAccountNamesMatch("cento e quarenta", "140")).toBe(true);
    expect(voiceAccountNamesMatch("Cofrinho cento e quarenta", "Cofrinho 140%")).toBe(true);
  });


  it.each([
    "Caixa CA",
    "Caixa alimentação",
    "Caixa ticket alimentação",
    "Caixa vale alimentação",
  ])("resolve apelido falado da conta Caixa alimentação: %s", (spoken) => {
    expect(voiceAccountNamesMatch(spoken, "Caixa CA CR (2508)")).toBe(true);
  });

  it("não transforma Caixa genérico na conta de alimentação", () => {
    expect(voiceAccountNamesMatch("Caixa", "Caixa CA CR (2508)")).toBe(false);
  });

  it("considera o nome da conta pai ao identificar uma subconta por voz", () => {
    expect(voiceAccountNamesMatch("Mercado Pago Cofrinho 140", "Cofrinho 140%", "Mercado Pago")).toBe(true);
    expect(voiceAccountNamesMatch("Mercado Pago Cofrinho 140%", "Cofrinho 140%", "Mercado Pago")).toBe(true);
    expect(voiceAccountNamesMatch("Mercado Pago Cofrinho 150", "Cofrinho 140%", "Mercado Pago")).toBe(false);
  });

  it("extrai conta hierárquica com percentual da fala completa", () => {
    const draft = parseVoiceTransaction(
      "Gastei 29 reais com almoço, referência Carol, categoria alimentação restaurante, na conta Mercado Pago Cofrinho 140%.",
      now,
    );

    expect(draft.bankAccount).toBe("Mercado Pago Cofrinho 140%");
  });

  it("interpreta corretamente a frase real com reais com, referência e conta hierárquica pontuada", () => {
    const draft = parseVoiceTransaction(
      "Ó, eu gastei 29 reais com almoço referência Carol, na categoria alimentação, padaria. Na conta Mercado Pago, cofrinho, 140. Lançar.",
      now,
    );

    expect(draft.amount).toBe(29);
    expect(draft.name).toBe("Almoço (Carol)");
    expect(draft.category).toBe("Alimentação > Padaria/Café");
    expect(draft.categorySource).toBe("spoken");
    expect(draft.bankAccount).toBe("Mercado Pago cofrinho 140");
    expect(voiceAccountNamesMatch(draft.bankAccount!, "Cofrinho 140%", "Mercado Pago")).toBe(true);
  });

  it.each([
    "Mercado Pago Cofrinho 140",
    "Mercado Pago Cofrinho 140%",
    "Mercado Pago Cofrinho 140 por cento",
    "Mercado Pago, Cofrinho, 140",
    "Mercado Pago, Cofrinho, 140%",
  ])("resolve variação falada da subconta: %s", (spokenAccount) => {
    expect(voiceAccountNamesMatch(spokenAccount, "Cofrinho 140%", "Mercado Pago")).toBe(true);
  });

  it("não confunde cofrinhos com números diferentes", () => {
    expect(voiceAccountNamesMatch("Mercado Pago Cofrinho 140", "Cofrinho 150%", "Mercado Pago")).toBe(false);
    expect(voiceAccountNamesMatch("Mercado Pago Cofrinho 150", "Cofrinho 140%", "Mercado Pago")).toBe(false);
  });

  it("aceita a mesma frase sem pontuação automática do reconhecimento", () => {
    const draft = parseVoiceTransaction(
      "eu gastei 29 reais com almoço referência Carol categoria alimentação padaria na conta Mercado Pago cofrinho 140% lançar",
      now,
    );

    expect(draft.name).toBe("Almoço (Carol)");
    expect(draft.category).toBe("Alimentação > Padaria/Café");
    expect(draft.bankAccount).toBe("Mercado Pago cofrinho 140%");
  });

  it("interpreta data falada no mesmo ano quando ela já ocorreu", () => {
    const reference = new Date(2026, 8, 24, 15, 0, 0);
    const draft = parseVoiceTransaction(
      "Gastei 29 reais com almoço data 23 de setembro conta Porto Bank",
      reference,
    );

    expect(draft.date).toBe("23-09-2026");
  });

  it("usa o último dia/mês ocorrido quando o ano não é falado", () => {
    const reference = new Date(2026, 0, 10, 12, 0, 0);

    expect(
      parseVoiceTransaction("Despesa nome Presente valor 100 data 25 de dezembro", reference).date,
    ).toBe("25-12-2025");

    expect(
      parseVoiceTransaction("Despesa nome Presente valor 100 data 25/12", reference).date,
    ).toBe("25-12-2025");
  });

  it.each([
    "data 25 do 12",
    "data 25 de 12",
    "dia 25 do 12",
    "25 do 12",
  ])("entende data numérica falada: %s", (spokenDate) => {
    const reference = new Date(2026, 0, 10, 12, 0, 0);
    expect(
      parseVoiceTransaction(`Despesa nome Presente valor 100 ${spokenDate}`, reference).date,
    ).toBe("25-12-2025");
  });


  it("mantém o ano explicitamente falado mesmo quando é anterior", () => {
    const reference = new Date(2026, 0, 10, 12, 0, 0);
    expect(
      parseVoiceTransaction("Despesa nome Presente valor 100 data 25 de dezembro de 2024", reference).date,
    ).toBe("25-12-2024");
  });

  it("continua entendendo hoje, ontem e anteontem", () => {
    const reference = new Date(2026, 8, 24, 15, 0, 0);
    expect(parseVoiceTransaction("Despesa nome Café valor 10 hoje", reference).date).toBe("24-09-2026");
    expect(parseVoiceTransaction("Despesa nome Café valor 10 ontem", reference).date).toBe("23-09-2026");
    expect(parseVoiceTransaction("Despesa nome Café valor 10 anteontem", reference).date).toBe("22-09-2026");
  });

  it("resolve 29 de fevereiro para a ocorrência válida mais recente", () => {
    const reference = new Date(2025, 2, 1, 12, 0, 0);
    expect(
      parseVoiceTransaction("Despesa nome Teste valor 10 data 29 de fevereiro", reference).date,
    ).toBe("29-02-2024");
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
    expect(unknown.categorySource).toBe("inferred");
    expect(unknown.category).toBe("Outros > Outros");
    expect(unknown.icon).toBe("📄");
  });

  it("distingue restaurante de delivery na inferência sem histórico", () => {
    expect(parseVoiceTransaction("Despesa, nome, Restaurante Central, valor, 60 reais", now).category)
      .toBe("Alimentação > Restaurante");
    expect(parseVoiceTransaction("Despesa, nome, iFood, valor, 45 reais", now).category)
      .toBe("Alimentação > Delivery");
  });

  it("entende frase informal completa com valor, referência e conta", () => {
    const draft = parseVoiceTransaction(
      "Gastei 150.99 em posto de gasolina referência Space Fox na conta Banco do Brasil.",
      now,
    );

    expect(draft.type).toBe("expense");
    expect(draft.amount).toBe(150.99);
    expect(draft.name).toBe("Posto de Gasolina (Spacefox)");
    expect(draft.category).toBe("Transporte > Combustível");
    expect(draft.bankAccount).toBe("Banco do Brasil");
  });

  it("aceita vírgula no valor da frase informal completa", () => {
    const draft = parseVoiceTransaction(
      "Gastei 150,99 em posto de gasolina referência Space Fox na conta Banco do Brasil",
      now,
    );
    expect(draft.amount).toBe(150.99);
    expect(draft.name).toBe("Posto de Gasolina (Spacefox)");
    expect(draft.bankAccount).toBe("Banco do Brasil");
  });


  it.each([
    ["Gastei 250,97 em posto de gasolina referência Space Fox categoria transporte combustível conta Porto Bank", "Posto de Gasolina (Spacefox)"],
    ["Gastei 250 reais e 97 centavos no posto de gasolina referência Space Fox categoria transporte combustível conta Porto Bank", "Posto de Gasolina (Spacefox)"],
    ["Gastei duzentos e cinquenta ponto noventa e sete em posto de gasolina referência Space Fox categoria transporte combustível conta Porto Bank", "Posto de Gasolina (Spacefox)"],
  ])("normaliza formas equivalentes de falar R$ 250,97: %s", (spoken, expectedName) => {
    const draft = parseVoiceTransaction(spoken, now);
    expect(draft.amount).toBe(250.97);
    expect(draft.name).toBe(expectedName);
    expect(draft.category).toBe("Transporte > Combustível");
    expect(draft.bankAccount).toBe("Porto Bank");
  });

  it.each([
    ["Gastei 40 reais em Padaria Central", "Padaria Central"],
    ["Gastei 40 reais na Padaria Central", "Padaria Central"],
    ["Gastei 40 reais no Restaurante Central", "Restaurante Central"],
  ])("usa em/no/na após o valor para identificar o nome: %s", (spoken, expectedName) => {
    expect(parseVoiceTransaction(spoken, now).name).toBe(expectedName);
  });


  it("separa corretamente nome e conta quando a conta 99 é falada por extenso", () => {
    const draft = parseVoiceTransaction(
      "Gastei cem reais no posto de gasolina na conta noventa e nove.",
      now,
    );

    expect(draft.amount).toBe(100);
    expect(draft.name).toBe("Posto de Gasolina");
    expect(draft.category).toBe("Transporte > Combustível");
    expect(draft.bankAccount).toBe("noventa e nove");
    expect(voiceAccountNamesMatch(draft.bankAccount!, "99")).toBe(true);
  });

  it("mantém o nome antes de referência e valor falado com ponto", () => {
    const draft = parseVoiceTransaction(
      "Lanço uma despesa, posto de gasolina, referência Space Fox, valor cento e quarenta ponto noventa e dois na conta Porto Bank.",
      now,
    );

    expect(draft.amount).toBe(140.92);
    expect(draft.name).toBe("Posto de Gasolina (Spacefox)");
    expect(draft.category).toBe("Transporte > Combustível");
    expect(draft.bankAccount).toBe("Porto Bank");
  });


  it("aceita 'pontos' no plural no valor falado", () => {
    const draft = parseVoiceTransaction(
      "Despesa, nome Max Atacadista, categoria Alimentação, Supermercado, valor duzentos e seis pontos sessenta e seis, cartão Mercado Pago.",
      now,
    );

    expect(draft.name).toBe("Max Atacadista");
    expect(draft.amount).toBe(206.66);
    expect(draft.category).toBe("Alimentação > Supermercado");
    expect(draft.card).toBe("Mercado Pago");
  });


  it.each([
    "Despesa, nome: Max Atacadista, categoria: Alimentação, Supermercado, valor: duzentos e seis pontos sessenta e seis, cartão: Mercado Pago.",
    "Despesa, nome Max Atacadista, categoria Alimentação, Supermercado, valor duzentos e seis pontos sessenta e seis, cartão Mercado Pago.",
    "Despesa, nome - Max Atacadista, categoria - Alimentação, Supermercado, valor - duzentos e seis pontos sessenta e seis, cartão - Mercado Pago.",
  ])("aceita separadores estruturados na categoria, valor e cartão: %s", (spoken) => {
    const draft = parseVoiceTransaction(spoken, now);

    expect(draft.name).toBe("Max Atacadista");
    expect(draft.amount).toBe(206.66);
    expect(draft.category).toBe("Alimentação > Supermercado");
    expect(draft.categorySource).toBe("spoken");
    expect(draft.card).toBe("Mercado Pago");
  });


  it.each([
    [
      "Despesa, nome: Max Atacadista, categoria: Alimentação, Supermercado, valor: duzentos e seis pontos sessenta e seis, cartão: Mercado Pago.",
      {
        name: "Max Atacadista",
        amount: 206.66,
        category: "Alimentação > Supermercado",
        card: "Mercado Pago",
      },
    ],
    [
      "Despesa nome Max Atacadista categoria Alimentação Supermercado valor duzentos e seis pontos sessenta e seis cartão Mercado Pago",
      {
        name: "Max Atacadista",
        amount: 206.66,
        category: "Alimentação > Supermercado",
        card: "Mercado Pago",
      },
    ],
    [
      "Despesa; nome - Max Atacadista; categoria - Alimentação, Supermercado; valor - duzentos e seis pontos sessenta e seis; cartão - Mercado Pago.",
      {
        name: "Max Atacadista",
        amount: 206.66,
        category: "Alimentação > Supermercado",
        card: "Mercado Pago",
      },
    ],
  ])("mantém campos estruturados estáveis apesar da pontuação: %s", (spoken, expected) => {
    const draft = parseVoiceTransaction(spoken, now);

    expect(draft.name).toBe(expected.name);
    expect(draft.amount).toBe(expected.amount);
    expect(draft.category).toBe(expected.category);
    expect(draft.categorySource).toBe("spoken");
    expect(draft.card).toBe(expected.card);
  });

  it("aceita campos estruturados em outra ordem", () => {
    const draft = parseVoiceTransaction(
      "Despesa cartão Mercado Pago valor 206,66 categoria Alimentação Supermercado nome Max Atacadista",
      now,
    );

    expect(draft.name).toBe("Max Atacadista");
    expect(draft.amount).toBe(206.66);
    expect(draft.category).toBe("Alimentação > Supermercado");
    expect(draft.categorySource).toBe("spoken");
    expect(draft.card).toBe("Mercado Pago");
  });

  it("categoria explicitamente falada prevalece sobre a inferência pelo nome", () => {
    const draft = parseVoiceTransaction(
      "Despesa, nome Restaurante Central, categoria Transporte Combustível, valor 100 reais, conta Porto Bank",
      now,
    );

    expect(draft.name).toBe("Restaurante Central");
    expect(draft.category).toBe("Transporte > Combustível");
    expect(draft.categorySource).toBe("spoken");
    expect(draft.bankAccount).toBe("Porto Bank");
  });

  it("valor explicitamente rotulado não é confundido com números da conta", () => {
    const draft = parseVoiceTransaction(
      "Despesa nome Teste valor cento e vinte reais conta 99",
      now,
    );

    expect(draft.amount).toBe(120);
    expect(draft.bankAccount).toBe("99");
  });

  it("separa referência, conta e cartão pelos rótulos sem depender de vírgulas", () => {
    const draft = parseVoiceTransaction(
      "Despesa nome Posto de Gasolina referência Space Fox categoria Transporte Combustível valor 140,92 conta Porto Bank",
      now,
    );

    expect(draft.name).toBe("Posto de Gasolina (Spacefox)");
    expect(draft.amount).toBe(140.92);
    expect(draft.category).toBe("Transporte > Combustível");
    expect(draft.bankAccount).toBe("Porto Bank");
    expect(draft.card).toBeNull();
  });

  it("interpreta parcelas explicitamente rotuladas", () => {
    const draft = parseVoiceTransaction(
      "Despesa nome Notebook valor 3000 cartão Porto Bank parcelas 10",
      now,
    );

    expect(draft.amount).toBe(3000);
    expect(draft.card).toBe("Porto Bank");
    expect(draft.installmentCount).toBe(10);
  });


  it("interpreta compra parcelada natural com valor total", () => {
    const draft = parseVoiceTransaction(
      "Comprei uma TV Samsung de 65 polegadas, categoria compras eletrônicos, valor quatro mil quinhentos e noventa, cartão PortoBank parcelado em dez vezes. Lançar.",
      now,
    );

    expect(draft.name).toBe('TV Samsung 65"');
    expect(draft.category).toBe("Compras > Eletrônicos");
    expect(draft.categorySource).toBe("spoken");
    expect(draft.amount).toBe(4590);
    expect(draft.card).toBe("PortoBank");
    expect(draft.installmentCount).toBe(10);
  });

  it.each([
    "parcelado em dez vezes",
    "parcelado em 10 vezes",
    "em dez vezes",
    "10x",
    "dez parcelas",
  ])("entende variação de parcelamento: %s", (installmentPhrase) => {
    const draft = parseVoiceTransaction(
      `Despesa nome TV Samsung valor 4590 cartão Porto Bank ${installmentPhrase}`,
      now,
    );

    expect(draft.amount).toBe(4590);
    expect(draft.card).toBe("Porto Bank");
    expect(draft.installmentCount).toBe(10);
  });

  it("considera PortoBank e Porto Bank o mesmo cartão", () => {
    expect(voiceCardNamesMatch("PortoBank", "Porto Bank")).toBe(true);
    expect(voiceCardNamesMatch("PORTO-BANK", "Porto Bank")).toBe(true);
  });


  it("interpreta exatamente o comando parcelado do print com referência Magalu", () => {
    const draft = parseVoiceTransaction(
      "Comprei uma TV Samsung 65 polegadas, referência Magalu, categoria Compras, eletrônicos, valor R$ 3.497,75, cartão Mercado Pago, 10 parcelas.",
      now,
    );

    expect(draft.name).toBe('TV Samsung 65" (Magalu)');
    expect(draft.category).toBe("Compras > Eletrônicos");
    expect(draft.categorySource).toBe("spoken");
    expect(draft.amount).toBe(3497.75);
    expect(draft.card).toBe("Mercado Pago");
    expect(draft.installmentCount).toBe(10);
  });


  it("interpreta o comando natural do print com PortoBank em 7 vezes", () => {
    const draft = parseVoiceTransaction(
      "Comprei uma TV Samsung 65 polegadas QHD LED, referência Magalu, categoria Compras, eletrônicos, valor R$ 3.749,67, cartão PortoBank em 7 vezes.",
      now,
    );

    expect(draft.name).toBe('TV Samsung 65" QHD LED (Magalu)');
    expect(draft.category).toBe("Compras > Eletrônicos");
    expect(draft.categorySource).toBe("spoken");
    expect(draft.amount).toBe(3749.67);
    expect(draft.card).toBe("PortoBank");
    expect(draft.installmentCount).toBe(7);
  });


  it("normaliza polegadas faladas no nome do produto", () => {
    const draft = parseVoiceTransaction(
      "Comprei uma TV Samsung de setenta polegadas QHD LED Smart Technology, referência Magalu. Categoria: Compras, eletrônicos. Valor: três mil novecentos e noventa e dois ponto vinte e cinco. Cartão: Porto Bank, em nove vezes. Lançar.",
      now,
    );

    expect(draft.name).toBe('TV Samsung 70" QHD LED Smart Technology (Magalu)');
    expect(draft.category).toBe("Compras > Eletrônicos");
    expect(draft.amount).toBe(3992.25);
    expect(draft.card).toBe("Porto Bank");
    expect(draft.installmentCount).toBe(9);
  });


  it("normaliza medida numérica em polegadas no comando do print", () => {
    const draft = parseVoiceTransaction(
      "Comprei uma TV Samsung de 29 polegadas, QHD LED, Dual Technology, referência Casas Bahia. Categoria: compras, outros, valor R$ 1.712,95, cartão PortoBank, em 12 vezes.",
      now,
    );

    expect(draft.name).toBe('TV Samsung 29" QHD LED Dual Technology (Casas Bahia)');
    expect(draft.category).toBe("Compras > Outros");
    expect(draft.amount).toBe(1712.95);
    expect(draft.card).toBe("PortoBank");
    expect(draft.installmentCount).toBe(12);
  });


  it("padroniza capitalização de referências comerciais", () => {
    expect(
      parseVoiceTransaction(
        "Comprei uma TV Samsung 50 polegadas, referência ponto frio, categoria compras eletrônicos, valor 2500 reais, cartão Porto Bank.",
        now,
      ).name,
    ).toBe('TV Samsung 50" (Ponto Frio)');

    expect(
      parseVoiceTransaction(
        "Comprei uma TV Samsung 50 polegadas, referência casas bahia, categoria compras eletrônicos, valor 2500 reais, cartão Porto Bank.",
        now,
      ).name,
    ).toBe('TV Samsung 50" (Casas Bahia)');
  });

});
