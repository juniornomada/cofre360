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
