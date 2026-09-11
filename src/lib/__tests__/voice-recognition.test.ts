import { describe, expect, it } from "vitest";
import { selectPreferredVoiceTranscript } from "@/lib/voice-recognition";

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
