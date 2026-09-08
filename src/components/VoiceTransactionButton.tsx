import { useRef, useState } from "react";
import { Loader2, Mic } from "lucide-react";
import { toast } from "sonner";
import { parseVoiceTransaction, type VoiceTransactionDraft } from "@/lib/voice-transaction";

interface SpeechRecognitionAlternativeLike {
  transcript?: string;
}

interface SpeechRecognitionResultLike {
  0?: SpeechRecognitionAlternativeLike;
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
  const finalSegmentsRef = useRef<Record<number, string>>({});
  const recognitionErrorRef = useRef(false);

  const stop = () => {
    recognitionRef.current?.stop();
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
      stop();
      return;
    }

    try {
      const recognition = new Recognition();
      recognition.lang = "pt-BR";
      recognition.interimResults = false;
      // Fala longa pode chegar em vários resultados finais. Acumulamos todos
      // e só interpretamos quando o usuário termina ou o navegador encerra a sessão.
      recognition.continuous = true;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;
      finalSegmentsRef.current = {};
      recognitionErrorRef.current = false;

      recognition.onresult = (event) => {
        const results = event.results;
        if (!results) return;
        const startIndex = Math.max(0, event.resultIndex ?? 0);
        for (let index = startIndex; index < results.length; index += 1) {
          const result = results[index];
          if (!result || result.isFinal === false) continue;
          const transcript = result[0]?.transcript?.trim() || "";
          if (transcript) finalSegmentsRef.current[index] = transcript;
        }
      };

      recognition.onerror = (event) => {
        const error = event.error || "";
        recognitionErrorRef.current = true;
        if (error === "not-allowed" || error === "service-not-allowed") {
          toast.error("Permita o acesso ao microfone para lançar por voz.");
        } else if (error === "no-speech") {
          toast.error("Não ouvi nenhuma fala. Tente novamente.");
        } else if (error !== "aborted") {
          toast.error("Não consegui usar o reconhecimento de voz agora.");
        }
      };

      recognition.onend = () => {
        const transcript = Object.entries(finalSegmentsRef.current)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([, value]) => value)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        setListening(false);
        recognitionRef.current = null;

        if (!recognitionErrorRef.current && transcript) {
          const draft = parseVoiceTransaction(transcript);
          onDraft(draft);
          toast.success("Áudio interpretado. Confira os campos antes de salvar.");
        } else if (!recognitionErrorRef.current && !transcript) {
          toast.error("Não consegui entender a fala. Tente novamente.");
        }
      };

      setListening(true);
      recognition.start();
    } catch (error) {
      console.error("voice transaction error:", error);
      setListening(false);
      recognitionRef.current = null;
      toast.error("Não consegui iniciar o microfone.");
    }
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
      title={listening ? "Ouvindo... toque para finalizar" : "Adicionar por voz"}
    >
      {listening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
    </button>
  );
}
