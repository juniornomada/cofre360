/**
 * Telemetria leve para detecções de rótulo LEGADO de pagamento de cartão
 * ("Pagamento (Total|Parcial) fatura cartão X") sendo normalizadas ao vivo
 * na UI para o formato canônico ("Pagamento (Total|Parcial) cartão X").
 *
 * Objetivo: auditar imports (PDFs, CSVs, planilhas antigas) que ainda
 * carregam o texto legado. Não substitui a normalização — apenas registra
 * cada ocorrência para inspeção posterior.
 *
 * Arquitetura:
 *   - Ring buffer em memória (MAX_EVENTS) para inspeção rápida em DevTools.
 *   - Persistência opcional em localStorage (últimos N eventos, para
 *     sobreviver a reloads durante uma sessão de auditoria).
 *   - Pub/sub síncrono para UIs que queiram exibir um badge/contagem.
 *   - `console.info` estruturado em dev; silencioso em produção.
 *   - Global `window.__legacyLabelAudit()` (dev) para dump rápido.
 *
 * Este módulo é PURO em relação ao runtime: safe para SSR (checa
 * `typeof window`) e não importa nada do domínio.
 */

export interface LegacyLabelEvent {
  /** timestamp ISO 8601 (ms precision) */
  at: string;
  /** texto original recebido do backend/import */
  raw: string;
  /** texto canônico produzido pela normalização */
  canonical: string;
  /** rota/tela onde a detecção ocorreu ("/cards", "TransactionItem", ...) */
  source: string;
  /** contexto adicional livre — cartão, período, id de transação, etc. */
  context?: Record<string, string | number | null | undefined>;
}

const MAX_EVENTS = 200;
const STORAGE_KEY = "cofre360:legacy_label_audit";

const buffer: LegacyLabelEvent[] = [];
type Listener = (event: LegacyLabelEvent) => void;
const listeners = new Set<Listener>();

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function isDev(): boolean {
  // Vite injects import.meta.env; guard para SSR/worker.
  try {
    const meta = import.meta as unknown as { env?: { DEV?: boolean } };
    return Boolean(meta?.env?.DEV);
  } catch {
    return false;
  }
}

function persist(): void {
  if (!isBrowser()) return;
  try {
    // Persiste apenas os últimos 50 para não estourar a quota (~5MB).
    const tail = buffer.slice(-50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tail));
  } catch {
    // Quota exceeded / storage indisponível: silenciosamente ignora.
  }
}

function hydrate(): void {
  if (!isBrowser()) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    for (const evt of parsed) {
      if (
        evt &&
        typeof evt.at === "string" &&
        typeof evt.raw === "string" &&
        typeof evt.canonical === "string" &&
        typeof evt.source === "string"
      ) {
        buffer.push(evt as LegacyLabelEvent);
      }
    }
    // trunca se veio maior do que o teto atual
    if (buffer.length > MAX_EVENTS) buffer.splice(0, buffer.length - MAX_EVENTS);
  } catch {
    /* ignora corrupção */
  }
}

let hydrated = false;
function ensureHydrated(): void {
  if (hydrated) return;
  hydrated = true;
  hydrate();
  if (isBrowser()) {
    // Global para inspeção rápida em DevTools: `__legacyLabelAudit()`
    // devolve um snapshot do buffer atual. Só instala em dev.
    if (isDev()) {
      (window as unknown as { __legacyLabelAudit?: () => LegacyLabelEvent[] })
        .__legacyLabelAudit = () => getLegacyLabelEvents();
    }
  }
}

/**
 * Registra uma detecção. O caller já garantiu que `raw !== canonical` e
 * que `raw` casou com o padrão legado — este módulo não repete a checagem.
 */
export function recordLegacyLabelDetection(input: {
  raw: string;
  canonical: string;
  source: string;
  context?: LegacyLabelEvent["context"];
}): void {
  ensureHydrated();
  const event: LegacyLabelEvent = {
    at: new Date().toISOString(),
    raw: input.raw,
    canonical: input.canonical,
    source: input.source,
    context: input.context,
  };
  buffer.push(event);
  if (buffer.length > MAX_EVENTS) buffer.shift();
  persist();
  for (const l of listeners) {
    try {
      l(event);
    } catch {
      /* listener isolado; não deve derrubar a UI */
    }
  }
  if (isDev() && typeof console !== "undefined") {
    // Estruturado para facilitar filtro no console.
    console.info(
      "[legacy-label]",
      event.source,
      { raw: event.raw, canonical: event.canonical, ...event.context },
    );
  }
}

/** Snapshot imutável do buffer atual (mais antigo → mais recente). */
export function getLegacyLabelEvents(): LegacyLabelEvent[] {
  ensureHydrated();
  return buffer.slice();
}

/** Assina eventos futuros. Retorna função de unsubscribe. */
export function subscribeLegacyLabelEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Limpa buffer em memória e storage. Útil em testes e após auditoria. */
export function clearLegacyLabelEvents(): void {
  buffer.length = 0;
  if (isBrowser()) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignora */
    }
  }
}
