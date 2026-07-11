import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { subscribeCycleMismatch, type CycleMismatchEvent } from "@/lib/cycle-consistency";

/**
 * DEV-only visual guard for billing-cycle drift between Home and /cards.
 *
 * Sits alongside the `console.warn` emitted by `reportCycleSnapshot`: fires a
 * persistent sonner toast for immediate developer awareness AND renders a
 * fixed banner at the bottom of the screen listing every distinct mismatch
 * seen this session. The banner is dismissible; toasts self-manage.
 *
 * Rendered only when `import.meta.env.DEV` is true — the whole component
 * short-circuits to `null` in production builds.
 */
export function CycleMismatchDevBanner() {
  const isDev = typeof import.meta !== "undefined" && !!(import.meta as any)?.env?.DEV;
  const [events, setEvents] = useState<CycleMismatchEvent[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isDev) return;
    return subscribeCycleMismatch((event) => {
      setEvents((prev) => [...prev, event]);
      setDismissed(false);
      const name = event.cardName ? `"${event.cardName}"` : `cartão ${event.cardId.slice(0, 6)}`;
      const label = event.monthLabel ? ` — ${event.monthLabel}` : "";
      const [a, b] = event.sources;
      toast.warning(`Divergência de fatura ${name}${label}`, {
        description: `${a.source}: R$ ${fmt(a.snapshot.total)} · ${b.source}: R$ ${fmt(b.snapshot.total)} (período ${event.periodKey})`,
        duration: 12000,
        id: `cycle-mismatch:${event.key}`,
      });
    });
  }, [isDev]);

  if (!isDev || dismissed || events.length === 0) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="cycle-mismatch-dev-banner"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] max-w-[min(92vw,520px)] rounded-xl border border-amber-500/50 bg-amber-500/10 backdrop-blur-md shadow-lg p-3 text-[11px] text-amber-100"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-amber-200 uppercase tracking-wide text-[10px]">
            DEV · Divergência de ciclo home ↔ /cards
          </p>
          <ul className="mt-1 space-y-1 max-h-40 overflow-auto">
            {events.map((e, idx) => (
              <li key={`${e.key}:${idx}`} className="leading-snug">
                <span className="font-medium">{e.cardName ?? e.cardId.slice(0, 6)}</span>
                {e.monthLabel ? <span className="opacity-80"> · {e.monthLabel}</span> : null}
                <span className="opacity-60"> · {e.periodKey}</span>
                <div className="pl-2 opacity-90">
                  {e.sources.map((s) => (
                    <div key={s.source}>
                      <span className="uppercase text-[9px] font-semibold mr-1">{s.source}</span>
                      total R$ {fmt(s.snapshot.total)} · pago R$ {fmt(s.snapshot.paid)} · faltam R$ {fmt(s.snapshot.remaining)}
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Fechar aviso de divergência"
          className="p-1 rounded-md hover:bg-amber-500/20 text-amber-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
