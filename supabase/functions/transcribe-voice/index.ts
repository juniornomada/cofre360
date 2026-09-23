import { generateTranscription } from "npm:@tanstack/ai@0.58.0";
import { createLovableTranscription } from "npm:@tanstack/ai-lovable@0.2.9";

const PROD_ORIGIN = "https://cofre360.vercel.app";
const ALLOWED_ORIGINS = new Set([
  PROD_ORIGIN,
  "https://cofre360.lovable.app",
  "http://localhost:5173",
  "http://localhost:3000",
]);

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : PROD_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, apikey, x-client-info, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Vary": "Origin",
  };
}

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  const corsHeaders = cors(req.headers.get("Origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "METHOD_NOT_ALLOWED" }, corsHeaders);
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    console.error("transcribe-voice missing LOVABLE_API_KEY");
    return json(503, { error: "TRANSCRIPTION_NOT_CONFIGURED" }, corsHeaders);
  }

  try {
    const form = await req.formData();
    const audio = form.get("audio");

    if (!(audio instanceof File) || audio.size <= 0) {
      return json(400, { error: "AUDIO_REQUIRED" }, corsHeaders);
    }
    if (audio.size > 12 * 1024 * 1024) {
      return json(
        413,
        { error: "AUDIO_TOO_LARGE", message: "A gravação excedeu o limite de 12 MB." },
        corsHeaders,
      );
    }

    const allowedMime =
      audio.type.startsWith("audio/") ||
      audio.type === "video/webm" ||
      audio.name.toLowerCase().endsWith(".webm") ||
      audio.name.toLowerCase().endsWith(".m4a") ||
      audio.name.toLowerCase().endsWith(".mp4");

    if (!allowedMime) {
      return json(415, { error: "UNSUPPORTED_AUDIO", mime: audio.type }, corsHeaders);
    }

    const adapter = createLovableTranscription(
      "openai/gpt-4o-mini-transcribe",
      apiKey,
    );

    const result = await generateTranscription({
      adapter,
      audio,
      language: "pt",
    });

    const text = String(result.text || "").replace(/\s+/g, " ").trim();
    if (!text) {
      return json(422, { error: "EMPTY_TRANSCRIPTION" }, corsHeaders);
    }

    return json(200, { ok: true, text }, corsHeaders);
  } catch (error) {
    console.error("transcribe-voice", error);
    return json(
      500,
      {
        error: "TRANSCRIPTION_FAILED",
        message: error instanceof Error ? error.message : "Falha ao transcrever áudio.",
      },
      corsHeaders,
    );
  }
});
