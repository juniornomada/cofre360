/**
 * Runtime consistency check for card billing cycles.
 *
 * Both the Home (`src/routes/index.tsx`) and the Cards page (`src/routes/cards.tsx`)
 * compute per-card / per-cycle totals independently. Historically these two
 * paths drifted (e.g. Home overwriting `created_at` with textual `date`,
 * classifying transactions into the wrong billing cycle).
 *
 * This helper collects the `(total, paid, remaining)` snapshot each surface
 * computes for a given `(cardId, periodKey)` and logs a `console.warn` when
 * two surfaces disagree by more than 1 cent.
 *
 * - Dev-only by default (opt-in via `enableCycleConsistencyCheck()` for e2e).
 * - Deduped: the same mismatch tuple is warned at most once.
 */

export type CycleSource = "home" | "cards" | (string & {});

export type CycleSnapshot = {
  total: number;
  paid: number;
  remaining: number;
};

type Key = string; // `${cardId}::${periodKey}`

const TOLERANCE = 0.01;

const snapshots: Map<Key, Map<CycleSource, CycleSnapshot>> = new Map();
const warned: Set<string> = new Set();

export type CycleMismatchEvent = {
  key: Key;
  cardId: string;
  cardName?: string;
  periodKey: string;
  monthLabel?: string;
  sources: {
    source: CycleSource;
    snapshot: CycleSnapshot;
  }[];
};

type Listener = (event: CycleMismatchEvent) => void;
const listeners: Set<Listener> = new Set();

/** Subscribe to mismatch events (fires once per deduped mismatch). */
export function subscribeCycleMismatch(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

let enabled: boolean = typeof import.meta !== "undefined" && !!(import.meta as any)?.env?.DEV;

export function enableCycleConsistencyCheck(on: boolean = true): void {
  enabled = on;
}

export function resetCycleConsistencyCheck(): void {
  snapshots.clear();
  warned.clear();
}

/** Read a copy of stored snapshots — intended for tests only. */
export function _debugSnapshots(): Record<string, Record<string, CycleSnapshot>> {
  const out: Record<string, Record<string, CycleSnapshot>> = {};
  for (const [k, bySource] of snapshots.entries()) {
    out[k] = Object.fromEntries(bySource);
  }
  return out;
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOLERANCE;
}

function fmt(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type ReportInput = CycleSnapshot & {
  source: CycleSource;
  cardId: string;
  cardName?: string;
  periodKey: string;
  monthLabel?: string;
};

/**
 * Record a cycle snapshot for a given surface. If a sibling surface already
 * recorded a different snapshot for the same `(cardId, periodKey)`, emit a
 * `console.warn` describing the divergence.
 *
 * Returns `true` when a mismatch was detected (regardless of whether we
 * warned — useful for tests).
 */
export function reportCycleSnapshot(input: ReportInput): boolean {
  if (!enabled) return false;
  const key: Key = `${input.cardId}::${input.periodKey}`;
  const snap: CycleSnapshot = {
    total: Number(input.total) || 0,
    paid: Number(input.paid) || 0,
    remaining: Number(input.remaining) || 0,
  };

  let bySource = snapshots.get(key);
  if (!bySource) {
    bySource = new Map();
    snapshots.set(key, bySource);
  }

  let mismatch = false;
  for (const [otherSource, other] of bySource.entries()) {
    if (otherSource === input.source) continue;
    if (!near(other.total, snap.total) || !near(other.paid, snap.paid) || !near(other.remaining, snap.remaining)) {
      mismatch = true;
      const dedupKey = [key, ...[otherSource, input.source].sort()].join("|");
      if (!warned.has(dedupKey)) {
        warned.add(dedupKey);
        const label = input.monthLabel ? ` (${input.monthLabel})` : "";
        const name = input.cardName ? ` "${input.cardName}"` : "";
        // eslint-disable-next-line no-console
        console.warn(
          `[cycle-consistency] Divergência de fatura para cartão${name}${label} — período ${input.periodKey}:\n` +
            `  ${otherSource}: total=R$ ${fmt(other.total)} pago=R$ ${fmt(other.paid)} faltam=R$ ${fmt(other.remaining)}\n` +
            `  ${input.source}: total=R$ ${fmt(snap.total)} pago=R$ ${fmt(snap.paid)} faltam=R$ ${fmt(snap.remaining)}`,
        );
        const event: CycleMismatchEvent = {
          key,
          cardId: input.cardId,
          cardName: input.cardName,
          periodKey: input.periodKey,
          monthLabel: input.monthLabel,
          sources: [
            { source: otherSource, snapshot: other },
            { source: input.source, snapshot: snap },
          ],
        };
        for (const l of listeners) {
          try { l(event); } catch { /* listener errors must not break the reporter */ }
        }
      }
    }
  }

  bySource.set(input.source, snap);
  return mismatch;
}
