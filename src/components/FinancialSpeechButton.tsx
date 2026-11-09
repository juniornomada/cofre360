import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { toast } from "sonner";
import {
  composeFinancialVoicePrompt,
  type BrowserSpeechResultEvent,
} from "@/lib/financial-voice-prompt";

type RecognitionError = { error: string };
type RecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: BrowserSpeechResultEvent) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: RecognitionError) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionConstructor = new () => RecognitionInstance;

function supportedRecognition(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as Window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

function errorMessage(code: string): string | null {
  switch (code) {
    case "aborted":
      return null;
    case "no-speech":
      return "Não ouvi sua voz. Tente novamente falando mais perto do microfone.";
    case "not-allowed":
    case "service-not-allowed":
      return "Permita o acesso ao microfone nas configurações do navegador.";
    case "audio-capture":
      return "Não foi possível acessar o microfone do celular.";
    case "network":
      return "O reconhecimento de voz precisa de conexão. Verifique a internet e tente novamente.";
    default:
      return "Não consegui reconhecer sua fala. Tente novamente ou digite a pergunta.";
  }
}

/**
 * Ditado de perguntas no navegador, sem uploads de áudio ou mudanças no banco.
 * A mensagem só é enviada quando a pessoa toca no botão Enviar do chat.
 * Alguns navegadores processam voz através de serviços externos próprios.
 */
export function FinancialSpeechButton({
  value,
  onTranscript,
  onRecordingChange,
  disabled = false,
}: {
  value: string;
  onTranscript: (text: string) => void;
  onRecordingChange: (recording: boolean) => void;
  disabled?: boolean;
}) {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const originalRef = useRef("");

  useEffect(() => {
    setSupported(supportedRecognition() !== null);
    return () => {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      if (recognition) {
        recognition.onstart = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        try { recognition.abort(); } catch { /* Already finished */ }
      }
    };
  }, []);

  useEffect(() => {
    if (!disabled || !recognitionRef.current) return;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try { recognition.abort(); } catch { /* Already finished */ }
    setRecording(false);
    onRecordingChange(false);
  }, [disabled, onRecordingChange]);

  const toggle = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        recognitionRef.current.abort();
      }
      return;
    }
    if (disabled) return;
    const Recognition = supportedRecognition();
    if (!Recognition) {
      toast.error("Este navegador não oferece ditado por voz. Você pode usar o microfone do teclado.");
      return;
    }
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    originalRef.current = value;
    recognition.lang = "pt-BR";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition) return;
      onTranscript(composeFinancialVoicePrompt(originalRef.current, event));
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      setRecording(false);
      onRecordingChange(false);
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      const message = errorMessage(event.error);
      if (message) toast.error(message);
      recognitionRef.current = null;
      setRecording(false);
      onRecordingChange(false);
    };

    try {
      // A chamada ocorre diretamente após o toque para liberar a permissão.
      recognition.start();
      setRecording(true);
      onRecordingChange(true);
    } catch {
      recognitionRef.current = null;
      setRecording(false);
      onRecordingChange(false);
      toast.error("Não consegui iniciar o microfone. Verifique as permissões do navegador.");
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!supported || (disabled && !recording)}
      aria-label={recording ? "Parar ditado por voz" : "Ditar pergunta ao Assistente Financeiro"}
      aria-pressed={recording}
      title={!supported
        ? "Ditado indisponível neste navegador. Use o microfone do teclado."
        : recording
          ? "Toque para parar. Revise o texto antes de enviar."
          : "Toque para falar sua pergunta em português"}
      className={`interactive-button flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${recording
        ? "border-red-500 bg-red-500/10 text-red-500 animate-pulse"
        : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"}`}
    >
      {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </button>
  );
}
