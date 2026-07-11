/**
 * mapServerError — normaliza erros de rede/Supabase/JS em uma mensagem
 * PT-BR consistente para exibir ao usuário via toast.
 *
 * Uso:
 *   toast.error(mapServerError(error, "Erro ao salvar transação"));
 *
 * Contract:
 *   - Recebe qualquer valor (unknown) — nunca lança.
 *   - Retorna sempre uma string não vazia.
 *   - Se `fallback` for informado, ele é usado como prefixo/contexto.
 *   - Se não houver mensagem legível, retorna "Erro desconhecido".
 */

type Errorish = {
  message?: unknown;
  error?: unknown;
  error_description?: unknown;
  msg?: unknown;
  hint?: unknown;
  details?: unknown;
  code?: unknown;
  status?: unknown;
  statusText?: unknown;
};

const NETWORK_HINTS = [
  "Failed to fetch",
  "NetworkError",
  "network request failed",
  "TypeError: fetch failed",
  "ERR_NETWORK",
  "ERR_INTERNET_DISCONNECTED",
];

const RLS_HINTS = [
  "row-level security",
  "row level security",
  "permission denied",
  "not authorized",
  "JWT expired",
  "invalid JWT",
];

const UNIQUE_HINTS = ["duplicate key", "unique constraint", "23505"];
const FK_HINTS = ["foreign key", "violates foreign key", "23503"];
const NOT_NULL_HINTS = ["null value", "23502"];
const TIMEOUT_HINTS = ["timeout", "ETIMEDOUT", "504"];

function extractRawMessage(err: unknown): string {
  if (err == null) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message || "";
  if (typeof err === "object") {
    const e = err as Errorish;
    const candidates = [
      e.message,
      e.error_description,
      typeof e.error === "string" ? e.error : undefined,
      e.msg,
      e.hint,
      e.details,
      e.statusText,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && c.trim().length > 0) return c;
    }
    // Nested Supabase-style { error: { message } }
    if (e.error && typeof e.error === "object") {
      const nested = extractRawMessage(e.error);
      if (nested) return nested;
    }
  }
  try {
    return String(err);
  } catch {
    return "";
  }
}

function classify(raw: string): string | null {
  const lower = raw.toLowerCase();
  if (NETWORK_HINTS.some((h) => lower.includes(h.toLowerCase()))) {
    return "Sem conexão com o servidor. Verifique sua internet e tente novamente.";
  }
  if (RLS_HINTS.some((h) => lower.includes(h.toLowerCase()))) {
    return "Sua sessão expirou ou você não tem permissão para esta ação.";
  }
  if (TIMEOUT_HINTS.some((h) => lower.includes(h.toLowerCase()))) {
    return "O servidor demorou para responder. Tente novamente em instantes.";
  }
  if (UNIQUE_HINTS.some((h) => lower.includes(h.toLowerCase()))) {
    return "Este registro já existe.";
  }
  if (FK_HINTS.some((h) => lower.includes(h.toLowerCase()))) {
    return "Existem dados vinculados que impedem esta operação.";
  }
  if (NOT_NULL_HINTS.some((h) => lower.includes(h.toLowerCase()))) {
    return "Preencha todos os campos obrigatórios.";
  }
  return null;
}

export function mapServerError(err: unknown, fallback?: string): string {
  const raw = extractRawMessage(err).trim();
  const friendly = raw ? classify(raw) : null;

  if (friendly) {
    return fallback ? `${fallback}: ${friendly}` : friendly;
  }

  if (fallback && raw) return `${fallback}: ${raw}`;
  if (fallback) return `${fallback}. Erro desconhecido.`;
  return raw || "Erro desconhecido";
}

export default mapServerError;
