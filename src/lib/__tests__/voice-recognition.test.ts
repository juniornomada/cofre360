import { describe, expect, it } from "vitest";
import { extractVoiceFinalizationCommand, selectPreferredVoiceTranscript } from "@/lib/voice-recognition";

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
