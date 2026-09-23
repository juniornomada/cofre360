const normalizeVoiceText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/**
 * Dá prioridade a alternativas que preservam informação monetária explícita.
 * Em especial, evita trocar "31 centavos" por uma alternativa ambígua como "R$ 31".
 */
export function scoreVoiceRecognitionTranscript(value: string): number {
  const text = normalizeVoiceText(value);
  if (!text) return Number.NEGATIVE_INFINITY;

  let score = 0;

  if (/\bcentavos?\b/.test(text)) score += 100;
  if (/\b(?:0|zero)[.,]\d{1,2}\b/.test(text)) score += 80;
  if (/\br\$\s*(?:0|zero)[.,]\d{1,2}\b/.test(text)) score += 40;
  if (/\b\d{1,2}\s+centavos?\b/.test(text)) score += 30;
  if (/\b(?:valor|reais?|real|conta|cartao|categoria|nome|receita|despesa)\b/.test(text)) score += 5;

  return score;
}

export function selectPreferredVoiceTranscript(alternatives: string[]): string {
  const candidates = alternatives
    .map((value, index) => ({ value: value.trim(), index }))
    .filter(({ value }) => value.length > 0);

  if (!candidates.length) return "";

  candidates.sort((a, b) => {
    const scoreDiff = scoreVoiceRecognitionTranscript(b.value) - scoreVoiceRecognitionTranscript(a.value);
    return scoreDiff || a.index - b.index;
  });

  return candidates[0].value;
}


export type VoiceFinalizationCommand = "confirmar" | "lançar" | "finalizar";

export function extractVoiceFinalizationCommand(value: string): {
  transcript: string;
  command: VoiceFinalizationCommand | null;
} {
  const compact = value.replace(/\s+/g, " ").trim();

  // Transcritores costumam variar o infinitivo "lançar" para formas naturais
  // como "lança" e "lance", especialmente quando a palavra aparece isolada.
  // Mantemos a detecção restrita ao FIM da fala para não confundir frases
  // como "quero lançar uma despesa amanhã" com um comando de finalização.
  const finalCommand = compact.match(
    /(?:^|\s)(?:(?:pode\s+)?(confirmar|finalizar|lan[cç]ar|lan[cç]a|lance)(?:\s+(?:a\s+)?transa[cç][aã]o)?)(?:\s*[.!?,;:]*)$/i,
  );
  if (!finalCommand) return { transcript: compact, command: null };

  const spoken = finalCommand[1]
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const command: VoiceFinalizationCommand =
    spoken.startsWith("lanc") || spoken === "lance"
      ? "lançar"
      : spoken === "finalizar"
        ? "finalizar"
        : "confirmar";

  let transcript = compact.slice(0, finalCommand.index).trim();

  // Se o usuário precisou repetir o comando ("lançar, lançar"), remova também
  // qualquer comando de finalização imediatamente anterior, para ele não virar
  // parte do nome/conta/categoria da transação.
  const trailingRepeatedCommand =
    /(?:^|\s)(?:(?:pode\s+)?(?:confirmar|finalizar|lan[cç]ar|lan[cç]a|lance)(?:\s+(?:a\s+)?transa[cç][aã]o)?)\s*[.!?,;:]*$/i;
  while (trailingRepeatedCommand.test(transcript)) {
    transcript = transcript.replace(trailingRepeatedCommand, "").trim();
  }

  return { transcript, command };
}
