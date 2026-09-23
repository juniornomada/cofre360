import { useRef, useState } from "react";
import { Loader2, Mic } from "lucide-react";
import { toast } from "sonner";
import { parseVoiceTransaction, type VoiceTransactionDraft } from "@/lib/voice-transaction";
import { extractVoiceFinalizationCommand, selectPreferredVoiceTranscript } from "@/lib/voice-recognition";

interface SpeechRecognitionAlternativeLike {
  transcript?: string;
  confidence?: number;
}

interface SpeechRecognitionResultLike {
  length?: number;
  [index: number]: SpeechRecognitionAlternativeLike | undefined;
  isFinal?: boolean;
}

interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike | undefined;
}

interface SpeechRecognitionEventLike {
  resultIndex?: number;
  results?: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorLike {
  error?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export function VoiceTransactionButton({ onDraft }: { onDraft: (draft: VoiceTransactionDraft) => void }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const sessionSegmentsRef = useRef<Record<number, string>>({});
  const accumulatedTranscriptRef = useRef("");
  const finalTranscriptRef = useRef<string | null>(null);
  const keepListeningRef = useRef(false);
  const manualFinalizeRef = useRef(false);
  const fatalErrorRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);

  const sessionTranscript = () =>
    Object.entries(sessionSegmentsRef.current)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, value]) => value)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

  const combinedTranscript = () =>
    [accumulatedTranscriptRef.current, sessionTranscript()]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

  const finalizeDraft = (transcript: string) => {
    const cleaned = transcript.replace(/\s+/g, " ").trim();
    setListening(false);
    recognitionRef.current = null;
    keepListeningRef.current = false;

    if (!fatalErrorRef.current && cleaned) {
      const draft = parseVoiceTransaction(cleaned);
      onDraft(draft);
      toast.success("Áudio interpretado. Confira os campos antes de salvar.");
    } else if (!fatalErrorRef.current && !cleaned) {
      toast.error("Não consegui entender a fala. Tente novamente.");
    }
  };

  const start = () => {
    if (typeof window === "undefined") return;

    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      toast.error("Seu navegador não oferece reconhecimento de voz. No Android, teste pelo Chrome.");
      return;
    }

    if (listening) {
      manualFinalizeRef.current = true;
      keepListeningRef.current = false;
      recognitionRef.current?.stop();
      return;
    }

    accumulatedTranscriptRef.current = "";
    finalTranscriptRef.current = null;
    sessionSegmentsRef.current = {};
    manualFinalizeRef.current = false;
    fatalErrorRef.current = false;
    keepListeningRef.current = true;
    setListening(true);

    const startRecognitionSession = () => {
      if (!keepListeningRef.current || fatalErrorRef.current) return;

      try {
        const recognition = new Recognition();
        recognition.lang = "pt-BR";
        recognition.interimResults = false;
        recognition.continuous = true;
        recognition.maxAlternatives = 5;
        recognitionRef.current = recognition;
        sessionSegmentsRef.current = {};

        recognition.onresult = (event) => {
          const results = event.results;
          if (!results) return;

          const startResultIndex = Math.max(0, event.resultIndex ?? 0);
          for (let index = startResultIndex; index < results.length; index += 1) {
            const result = results[index];
            if (!result || result.isFinal === false) continue;

            const alternatives: string[] = [];
            const alternativeCount = Math.max(1, result.length ?? 1);
            for (let alternativeIndex = 0; alternativeIndex < alternativeCount; alternativeIndex += 1) {
              const transcript = result[alternativeIndex]?.transcript?.trim() || "";
              if (transcript) alternatives.push(transcript);
            }

            const transcript = selectPreferredVoiceTranscript(alternatives);
            if (transcript) sessionSegmentsRef.current[index] = transcript;
          }

          const detected = extractVoiceFinalizationCommand(combinedTranscript());
          if (detected.command) {
            finalTranscriptRef.current = detected.transcript;
            keepListeningRef.current = false;
            recognition.stop();
          }
        };

        recognition.onerror = (event) => {
          const error = event.error || "";

          // Chrome/Android can emit no-speech when the user pauses to think.
          // Treat it as a pause: onend will start a fresh recognition session.
          if (error === "no-speech") return;

          if (error === "aborted" && (!keepListeningRef.current || manualFinalizeRef.current)) {
            return;
          }

          fatalErrorRef.current = true;
          keepListeningRef.current = false;

          if (error === "not-allowed" || error === "service-not-allowed") {
            toast.error("Permita o acesso ao microfone para lançar por voz.");
          } else {
            toast.error("Não consegui usar o reconhecimento de voz agora.");
          }
        };

        recognition.onend = () => {
          const currentSession = sessionTranscript();

          if (finalTranscriptRef.current === null && currentSession) {
            accumulatedTranscriptRef.current = [
              accumulatedTranscriptRef.current,
              currentSession,
            ]
              .filter(Boolean)
              .join(" ")
              .replace(/\s+/g, " ")
              .trim();
          }

          recognitionRef.current = null;
          sessionSegmentsRef.current = {};

          if (fatalErrorRef.current) {
            setListening(false);
            return;
          }

          if (keepListeningRef.current) {
            // The Web Speech API controls its own silence timeout. Restarting the
            // session keeps the Cofre360 listening through longer thinking pauses.
            restartTimerRef.current = window.setTimeout(startRecognitionSession, 250);
            return;
          }

          const transcript =
            finalTranscriptRef.current ??
            accumulatedTranscriptRef.current;

          finalizeDraft(transcript);
        };

        recognition.start();
      } catch (error) {
        console.error("voice transaction error:", error);
        fatalErrorRef.current = true;
        keepListeningRef.current = false;
        setListening(false);
        recognitionRef.current = null;
        toast.error("Não consegui iniciar o microfone.");
      }
    };

    startRecognitionSession();
  };

  return (
    <button
      type="button"
      onClick={start}
      className={`flex h-9 w-9 items-center justify-center rounded-full border transition-all ${
        listening
          ? "border-destructive/50 bg-destructive/15 text-destructive shadow-[0_0_0_4px_hsl(var(--destructive)/0.08)]"
          : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
      }`}
      aria-label={listening ? "Finalizar lançamento por voz" : "Adicionar transação por voz"}
      title={
        listening
          ? 'Ouvindo... diga "confirmar", "lançar" ou "finalizar", ou toque para concluir'
          : "Adicionar por voz"
      }
    >
      {listening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
    </button>
  );
}

