import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FinancialSpeechButton } from "@/components/FinancialSpeechButton";
import {
  composeFinancialVoicePrompt,
  type BrowserSpeechResultEvent,
} from "@/lib/financial-voice-prompt";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const speechResults = (...parts: string[]): BrowserSpeechResultEvent => ({
  results: parts.map((part) => Object.assign([{ transcript: part }], { isFinal: true })),
});

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  continuous = true;
  interimResults = false;
  onresult: ((event: BrowserSpeechResultEvent) => void) | null = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  started = false;
  stopped = false;
  aborted = false;

  constructor() { FakeRecognition.instances.push(this); }
  start() { this.started = true; this.onstart?.(); }
  stop() { this.stopped = true; this.onend?.(); }
  abort() { this.aborted = true; }
}

describe("Ditado por voz do Assistente Financeiro", () => {
  beforeEach(() => {
    FakeRecognition.instances = [];
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognition);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("compõe a fala com o rascunho sem duplicar trechos parciais reenviados", () => {
    expect(composeFinancialVoicePrompt("Compare", speechResults("Transporte", " e Alimentação")))
      .toBe("Compare Transporte e Alimentação");
    expect(composeFinancialVoicePrompt(" Compare  ", speechResults("Transporte", " e Alimentação novamente")))
      .toBe("Compare Transporte e Alimentação novamente");
    expect(composeFinancialVoicePrompt("", speechResults("Qual foi o gasto em novembro?")))
      .toBe("Qual foi o gasto em novembro?");
  });

  it("ativa microfone em pt-BR, mostra texto e permite parar sem enviar automaticamente", async () => {
    const onTranscript = vi.fn();
    const onRecordingChange = vi.fn();
    render(<FinancialSpeechButton
      value="Compare"
      onTranscript={onTranscript}
      onRecordingChange={onRecordingChange}
    />);
    const button = screen.getByRole("button", { name: "Ditar pergunta ao Assistente Financeiro" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    const recognition = FakeRecognition.instances[0];
    expect(recognition).toBeDefined();
    expect(recognition.started).toBe(true);
    expect(recognition.lang).toBe("pt-BR");
    expect(recognition.continuous).toBe(false);
    expect(recognition.interimResults).toBe(true);
    expect(onRecordingChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole("button", { name: "Parar ditado por voz" })).toHaveAttribute("aria-pressed", "true");

    recognition.onresult?.(speechResults("os gastos com alimentação em outubro"));
    expect(onTranscript).toHaveBeenCalledWith("Compare os gastos com alimentação em outubro");

    fireEvent.click(screen.getByRole("button", { name: "Parar ditado por voz" }));
    expect(recognition.stopped).toBe(true);
    expect(onRecordingChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("button", { name: "Ditar pergunta ao Assistente Financeiro" }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("não inicia quando o assistente está ocupado e encerra a captura ao desmontar", async () => {
    const onTranscript = vi.fn();
    const onRecordingChange = vi.fn();
    const view = render(<FinancialSpeechButton value="" onTranscript={onTranscript}
      onRecordingChange={onRecordingChange} disabled />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Ditar pergunta ao Assistente Financeiro" })).toBeDisabled());
    expect(FakeRecognition.instances).toHaveLength(0);
    view.rerender(<FinancialSpeechButton value="" onTranscript={onTranscript} onRecordingChange={onRecordingChange} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Ditar pergunta ao Assistente Financeiro" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Ditar pergunta ao Assistente Financeiro" }));
    const recognition = FakeRecognition.instances[0];
    view.unmount();
    expect(recognition.aborted).toBe(true);
    expect(recognition.onresult).toBeNull();
  });
});

describe("Integração do microfone com a conversa financeira", () => {
  const chat = readFileSync(resolve(process.cwd(), "src/components/FinancialChat.tsx"), "utf8");
  const voice = readFileSync(resolve(process.cwd(), "src/components/FinancialSpeechButton.tsx"), "utf8");

  it("mostra o microfone ao lado do campo e exige confirmação explícita para enviar", () => {
    expect(chat).toContain("<FinancialSpeechButton");
    expect(chat).toContain("onTranscript={setInput}");
    expect(chat).toContain("disabled={isLoading || !historyReady || voiceRecording || !input.trim()}");
    expect(chat).toContain("if (!messageText || isLoading || !historyReady || voiceRecording) return;");
    expect(chat).toContain("revise o texto e envie");
  });

  it("não armazena arquivos de áudio nem modifica transações ou histórico automaticamente", () => {
    expect(voice).toContain('recognition.lang = "pt-BR"');
    expect(voice).toContain("recognition.abort()");
    expect(voice).not.toContain("MediaRecorder");
    expect(voice).not.toContain(".from(");
    expect(voice).not.toContain("fetch(");
    expect(voice).not.toContain("supabase.functions.invoke");
  });
});
