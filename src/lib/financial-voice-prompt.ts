/** Minimal event shape shared with the browser's SpeechRecognition API. */
export type BrowserSpeechResult = {
  readonly isFinal: boolean;
  readonly [index: number]: { readonly transcript: string };
};
export type BrowserSpeechResultEvent = {
  readonly results: ArrayLike<BrowserSpeechResult>;
};

/** Build a preview from the *entire* current recognition result set.
 * Chrome may re-send a previous final segment together with an interim one.
 * Never append on each event, or partial phrases will be duplicated.
 */
export function composeFinancialVoicePrompt(
  original: string,
  event: BrowserSpeechResultEvent,
): string {
  const utterances: string[] = [];
  for (let index = 0; index < event.results.length; index += 1) {
    const result = event.results[index];
    const transcript = result?.[0]?.transcript?.trim();
    if (transcript) utterances.push(transcript);
  }
  const spoken = utterances.join(" ").replace(/\s+/g, " ").trim();
  return [original.trim(), spoken].filter(Boolean).join(" ");
}
