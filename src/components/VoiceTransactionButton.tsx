import { useRef, useState } from "react";
import { Loader2, Mic } from "lucide-react";
import { toast } from "sonner";
import { parseVoiceTransaction, type VoiceTransactionDraft } from "@/lib/voice-transaction";

interface SpeechRecognitionResultLike {
  0?: { transcript?: string };
}

interface SpeechRecognitionEventLike {
  results?: { 0?: SpeechRecognitionResultLike };
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
      recognition.continuous = false;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;

      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim() || "";
        if (!transcript) {
          toast.error("Não consegui entender a fala. Tente novamente.");
          return;
        }
        const draft = parseVoiceTransaction(transcript);
        onDraft(draft);
        toast.success(`Entendi: “${transcript}”`);
      };

      recognition.onerror = (event) => {
        const error = event.error || "";
        if (error === "not-allowed" || error === "service-not-allowed") {
          toast.error("Permita o acesso ao microfone para lançar por voz.");
        } else if (error === "no-speech") {
          toast.error("Não ouvi nenhuma fala. Tente novamente.");
        } else if (error !== "aborted") {
          toast.error("Não consegui usar o reconhecimento de voz agora.");
        }
      };

      recognition.onend = () => {
        setListening(false);
        recognitionRef.current = null;
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
      aria-label={listening ? "Parar gravação de voz" : "Adicionar transação por voz"}
      title={listening ? "Ouvindo... toque para parar" : "Adicionar por voz"}
    >
      {listening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
    </button>
  );
}
