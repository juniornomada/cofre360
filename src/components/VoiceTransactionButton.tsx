import { useRef, useState } from "react";
import { Loader2, Mic } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { parseVoiceTransaction, type VoiceTransactionDraft } from "@/lib/voice-transaction";
import { extractVoiceFinalizationCommand } from "@/lib/voice-recognition";

type TranscriptionResponse = {
  ok?: boolean;
  text?: string;
  error?: string;
  message?: string;
};

const COMMAND_WINDOW_MS = 4000;

function preferredAudioMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function audioExtension(mimeType: string) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("webm")) return "webm";
  return "audio";
}

async function transcriptionErrorDetails(error: any) {
  try {
    const response = error?.context;
    if (response && typeof response.clone === "function") {
      const payload = await response.clone().json();
      return payload?.message || payload?.error || error?.message || "Falha na transcrição";
    }
  } catch {
    // Ignore response decoding errors.
  }
  return error?.message || "Falha na transcrição";
}

async function transcribeAudio(blob: Blob, label: string) {
  const mimeType = blob.type || "audio/webm";
  const form = new FormData();
  form.append(
    "audio",
    new File([blob], `cofre360-${label}.${audioExtension(mimeType)}`, { type: mimeType }),
  );

  const { data, error } = await supabase.functions.invoke<TranscriptionResponse>(
    "transcribe-voice",
    { body: form },
  );

  if (error) {
    throw new Error(await transcriptionErrorDetails(error));
  }
  if (!data?.ok || !data.text?.trim()) {
    throw new Error(data?.message || data?.error || "Não foi possível transcrever o áudio.");
  }

  return data.text.trim();
}

export function VoiceTransactionButton({ onDraft }: { onDraft: (draft: VoiceTransactionDraft) => void }) {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const commandRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const commandTimerRef = useRef<number | null>(null);
  const commandLoopActiveRef = useRef(false);
  const finishingRef = useRef(false);
  const commandCheckSerialRef = useRef(0);

  const stopCommandLoop = () => {
    commandLoopActiveRef.current = false;
    commandCheckSerialRef.current += 1;

    if (commandTimerRef.current !== null) {
      window.clearTimeout(commandTimerRef.current);
      commandTimerRef.current = null;
    }

    const commandRecorder = commandRecorderRef.current;
    commandRecorderRef.current = null;
    if (commandRecorder && commandRecorder.state !== "inactive") {
      try {
        commandRecorder.stop();
      } catch {
        // It may already be stopping.
      }
    }
  };

  const cleanupStream = () => {
    stopCommandLoop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setListening(false);
  };

  const finishRecording = () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    stopCommandLoop();

    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }

    cleanupStream();
    finishingRef.current = false;
  };

  const startCommandWindow = (stream: MediaStream, mimeType: string) => {
    if (!commandLoopActiveRef.current || finishingRef.current || !stream.active) return;

    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch {
      return;
    }

    const parts: Blob[] = [];
    commandRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) parts.push(event.data);
    };

    recorder.onstop = () => {
      if (commandRecorderRef.current === recorder) {
        commandRecorderRef.current = null;
      }

      if (commandLoopActiveRef.current && !finishingRef.current && stream.active) {
        window.setTimeout(() => startCommandWindow(stream, mimeType), 0);
      }

      if (!parts.length || finishingRef.current) return;

      const blob = new Blob(parts, { type: recorder.mimeType || mimeType || "audio/webm" });
      const serial = commandCheckSerialRef.current;

      void transcribeAudio(blob, "comando")
        .then((text) => {
          if (
            serial !== commandCheckSerialRef.current ||
            !commandLoopActiveRef.current ||
            finishingRef.current
          ) {
            return;
          }

          const detected = extractVoiceFinalizationCommand(text);
          if (detected.command) {
            finishRecording();
          }
        })
        .catch((error) => {
          // The command detector is only a convenience. Never interrupt the main
          // continuous recording if one short transcription window fails.
          console.warn("voice command detection error:", error);
        });
    };

    try {
      recorder.start();
      commandTimerRef.current = window.setTimeout(() => {
        commandTimerRef.current = null;
        if (recorder.state !== "inactive") {
          try {
            recorder.stop();
          } catch {
            // Ignore a race with finishRecording().
          }
        }
      }, COMMAND_WINDOW_MS);
    } catch {
      if (commandRecorderRef.current === recorder) {
        commandRecorderRef.current = null;
      }
    }
  };

  const start = async () => {
    if (typeof window === "undefined") return;

    if (listening) {
      finishRecording();
      return;
    }

    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      toast.error("Seu navegador não oferece gravação de áudio compatível.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const mimeType = preferredAudioMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      finishingRef.current = false;
      commandLoopActiveRef.current = true;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onerror = (event) => {
        console.error("voice recorder error:", event);
        toast.error("Ocorreu um erro durante a gravação do áudio.");
        cleanupStream();
        finishingRef.current = false;
      };

      recorder.onstop = () => {
        const chunks = [...chunksRef.current];
        const finalMimeType = recorder.mimeType || mimeType || "audio/webm";

        stopCommandLoop();
        setListening(false);

        const audio = new Blob(chunks, { type: finalMimeType });
        if (!audio.size) {
          cleanupStream();
          finishingRef.current = false;
          toast.error("Não consegui capturar o áudio. Tente novamente.");
          return;
        }

        setTranscribing(true);

        void transcribeAudio(audio, "transacao")
          .then((text) => {
            const detected = extractVoiceFinalizationCommand(text);
            const transcript = (detected.command ? detected.transcript : text)
              .replace(/\s+/g, " ")
              .trim();

            if (!transcript) {
              throw new Error("A transcrição ficou vazia.");
            }

            const draft = parseVoiceTransaction(transcript);
            onDraft(draft);
            toast.success("Áudio interpretado. Confira os campos antes de salvar.");
          })
          .catch((error) => {
            console.error("voice transcription error:", error);
            toast.error(
              error instanceof Error
                ? error.message
                : "Não consegui transcrever o áudio. Tente novamente.",
            );
          })
          .finally(() => {
            setTranscribing(false);
            cleanupStream();
            finishingRef.current = false;
          });
      };

      recorder.start();
      setListening(true);
      startCommandWindow(stream, mimeType);
    } catch (error) {
      console.error("voice transaction error:", error);
      cleanupStream();
      finishingRef.current = false;

      if (
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "SecurityError")
      ) {
        toast.error("Permita o acesso ao microfone para lançar por voz.");
      } else {
        toast.error("Não consegui iniciar o microfone.");
      }
    }
  };

  const busy = listening || transcribing;

  return (
    <button
      type="button"
      onClick={() => void start()}
      disabled={transcribing}
      className={`flex h-9 w-9 items-center justify-center rounded-full border transition-all ${
        listening
          ? "border-destructive/50 bg-destructive/15 text-destructive shadow-[0_0_0_4px_hsl(var(--destructive)/0.08)]"
          : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
      } disabled:cursor-wait disabled:opacity-70`}
      aria-label={
        transcribing
          ? "Transcrevendo lançamento por voz"
          : listening
            ? "Finalizar lançamento por voz"
            : "Adicionar transação por voz"
      }
      title={
        transcribing
          ? "Transcrevendo áudio..."
          : listening
            ? 'Gravando continuamente. Diga "confirmar", "lançar" ou "finalizar", ou toque para concluir'
            : "Adicionar por voz"
      }
    >
      {transcribing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Mic className={`h-4 w-4 ${busy ? "animate-pulse" : ""}`} />
      )}
    </button>
  );
}
