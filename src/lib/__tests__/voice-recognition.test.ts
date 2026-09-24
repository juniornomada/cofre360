import { describe, expect, it } from "vitest";
import { extractStandaloneVoiceFinalizationCommand, extractVoiceFinalizationCommand, selectPreferredVoiceTranscript } from "@/lib/voice-recognition";

describe("selectPreferredVoiceTranscript", () => {
  it("prefere alternativa que preserva centavos", () => {
    expect(selectPreferredVoiceTranscript([
      "receita nome rendimento valor R$ 31 conta Cofrinho 140",
      "receita nome rendimento valor 31 centavos conta Cofrinho 140",
    ])).toContain("31 centavos");
  });

  it("prefere valor decimal explícito a inteiro ambíguo", () => {
    expect(selectPreferredVoiceTranscript([
      "receita nome rendimento valor 31 conta Cofrinho 140",
      "receita nome rendimento valor 0,31 conta Cofrinho 140",
    ])).toContain("0,31");
  });
});


describe("extractVoiceFinalizationCommand", () => {
  it.each([
    ["Despesa nome XPTO valor 250 confirmar", "confirmar"],
    ["Despesa nome XPTO valor 250 lançar", "lançar"],
    ["Despesa nome XPTO valor 250 lancar", "lançar"],
    ["Despesa nome XPTO valor 250 lança", "lançar"],
    ["Despesa nome XPTO valor 250 lanca", "lançar"],
    ["Despesa nome XPTO valor 250 lance", "lançar"],
    ["Despesa nome XPTO valor 250 pode lançar", "lançar"],
    ["Despesa nome XPTO valor 250 lançar a transação", "lançar"],
    ["Despesa nome XPTO valor 250 finalizar.", "finalizar"],
  ])("encerra somente quando o comando aparece no fim: %s", (spoken, command) => {
    expect(extractVoiceFinalizationCommand(spoken)).toEqual({
      transcript: "Despesa nome XPTO valor 250",
      command,
    });
  });

  it("remove repetição do comando lançar do fim da transcrição", () => {
    expect(extractVoiceFinalizationCommand(
      "Despesa nome XPTO valor 250 lançar. Lançar.",
    )).toEqual({
      transcript: "Despesa nome XPTO valor 250",
      command: "lançar",
    });
  });

  it("não encerra quando nenhuma palavra de finalização foi dita", () => {
    expect(extractVoiceFinalizationCommand(
      "Despesa nome XPTO categoria alimentação restaurante valor 250 conta Mercado Pago",
    )).toEqual({
      transcript: "Despesa nome XPTO categoria alimentação restaurante valor 250 conta Mercado Pago",
      command: null,
    });
  });

  it("não interpreta comando no meio da frase como encerramento", () => {
    expect(extractVoiceFinalizationCommand(
      "quero confirmar a categoria alimentação e continuar falando",
    ).command).toBeNull();
  });
});

describe("finalização no monitor contínuo", () => {
  it.each([
    ["... conta Mercado Pago lançar", "lançar"],
    ["... conta Mercado Pago confirmar", "confirmar"],
    ["... conta Mercado Pago finalizar", "finalizar"],
    ["categoria alimentação padaria, lançar.", "lançar"],
    ["valor 29 reais confirmar!", "confirmar"],
    ["referência Carol finalizar", "finalizar"],
  ])("detecta o comando mesmo quando ele vem colado ao fim do trecho: %s", (spoken, command) => {
    expect(extractVoiceFinalizationCommand(spoken).command).toBe(command);
  });

  it.each([
    "quero lançar uma despesa amanhã",
    "preciso confirmar a categoria antes de continuar",
    "vou finalizar os dados depois",
  ])("não encerra quando a palavra aparece no meio da fala: %s", (spoken) => {
    expect(extractVoiceFinalizationCommand(spoken).command).toBeNull();
  });
});

describe("extractStandaloneVoiceFinalizationCommand", () => {
  it.each([
    ["lançar", "lançar"],
    ["Lançar.", "lançar"],
    ["pode lançar", "lançar"],
    ["lançar a transação", "lançar"],
    ["confirmar", "confirmar"],
    ["finalizar!", "finalizar"],
  ])("aceita comando isolado: %s", (spoken, command) => {
    expect(extractStandaloneVoiceFinalizationCommand(spoken)).toBe(command);
  });

  it.each([
    "Comprei uma TV Samsung 70 polegadas QHD LED referência Magalu",
    "Comprei uma TV Samsung 70 polegadas QHD LED, referência Magalu, categoria Compras eletrônicos",
    "Despesa nome XPTO valor 250",
    "quero lançar uma despesa amanhã",
    "categoria compras eletrônicos cartão PortoBank em sete vezes",
  ])("não encerra gravação com conteúdo de transação sem comando isolado: %s", (spoken) => {
    expect(extractStandaloneVoiceFinalizationCommand(spoken)).toBeNull();
  });
});

