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

/**
 * Tolerance for considering two snapshots equal.
 *
 * - `absolute` — hard floor expressed in reais (e.g. `0.01` = 1 cent).
 * - `percent`  — relative floor as a fraction of `max(|a|, |b|)` (e.g. `0.001` = 0.1%).
 *
 * Two values `a` and `b` are considered equal when
 * `|a - b| <= max(absolute, percent * max(|a|, |b|))`.
 *
 * Defaults: `absolute = 0.01`, `percent = 0` (pure 1-cent tolerance).
 *
 * Overridable at runtime via `configureCycleTolerance()` (tests) or at
 * bundle time via env vars read from `import.meta.env`:
 *   - `VITE_CYCLE_TOLERANCE_CENTS` — integer cents, e.g. `"1"` or `"5"`.
 *   - `VITE_CYCLE_TOLERANCE_REAIS` — decimal reais, e.g. `"0.01"`.
 *   - `VITE_CYCLE_TOLERANCE_PERCENT` — fraction (`"0.001"`) or percent
 *     string (`"0.1%"`).
 * `CENTS` wins over `REAIS` when both are present.
 */
export type CycleTolerance = {
  absolute: number;
  percent: number;
};

function readEnv(name: string): string | undefined {
  try {
    const env = (import.meta as any)?.env;
    const v = env?.[name];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  } catch { /* import.meta unavailable */ }
  try {
    const v = (globalThis as any)?.process?.env?.[name];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  } catch { /* no process */ }
  return undefined;
}

function parseNumber(s: string | undefined): number | undefined {
  if (s === undefined) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function parsePercent(s: string | undefined): number | undefined {
  if (s === undefined) return undefined;
  const trimmed = s.endsWith("%") ? s.slice(0, -1) : s;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return undefined;
  return s.endsWith("%") ? n / 100 : n;
}

function defaultTolerance(): CycleTolerance {
  const cents = parseNumber(readEnv("VITE_CYCLE_TOLERANCE_CENTS"));
  const reais = parseNumber(readEnv("VITE_CYCLE_TOLERANCE_REAIS"));
  const percent = parsePercent(readEnv("VITE_CYCLE_TOLERANCE_PERCENT"));
  const absolute =
    cents !== undefined && cents >= 0 ? cents / 100
    : reais !== undefined && reais >= 0 ? reais
    : 0.01;
  return {
    absolute,
    percent: percent !== undefined && percent >= 0 ? percent : 0,
  };
}

let tolerance: CycleTolerance = defaultTolerance();

/** Override the tolerance at runtime. Pass `null` / no arg to reset to env defaults. */
export function configureCycleTolerance(next?: Partial<CycleTolerance> | null): CycleTolerance {
  if (!next) {
    tolerance = defaultTolerance();
  } else {
    tolerance = {
      absolute: next.absolute !== undefined && next.absolute >= 0 ? next.absolute : tolerance.absolute,
      percent: next.percent !== undefined && next.percent >= 0 ? next.percent : tolerance.percent,
    };
  }
  return { ...tolerance };
}

export function getCycleTolerance(): CycleTolerance {
  return { ...tolerance };
}

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
  const diff = Math.abs(a - b);
  const bound = Math.max(tolerance.absolute, tolerance.percent * Math.max(Math.abs(a), Math.abs(b)));
  return diff <= bound;
}

function fmt(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toCents(n: number): number {
  return Math.round(n * 100);
}

function signed(n: number): string {
  const s = fmt(Math.abs(n));
  return `${n < 0 ? "-" : "+"}R$ ${s}`;
}

function signedCents(n: number): string {
  const c = toCents(n);
  return `${c < 0 ? "" : "+"}${c}`;
}

function normalize(s: CycleSnapshot) {
  return {
    total: { reais: round2(s.total), cents: toCents(s.total) },
    paid: { reais: round2(s.paid), cents: toCents(s.paid) },
    remaining: { reais: round2(s.remaining), cents: toCents(s.remaining) },
  };
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
        const deltaTotal = snap.total - other.total;
        const deltaPaid = snap.paid - other.paid;
        const deltaRemaining = snap.remaining - other.remaining;
        const meta = {
          cardId: input.cardId,
          cardName: input.cardName ?? null,
          periodKey: input.periodKey,
          monthLabel: input.monthLabel ?? null,
          tolerance: { absolute: tolerance.absolute, absoluteCents: toCents(tolerance.absolute), percent: tolerance.percent },
          [otherSource]: normalize(other),
          [input.source]: normalize(snap),
          delta: {
            total: { reais: round2(deltaTotal), cents: toCents(deltaTotal) },
            paid: { reais: round2(deltaPaid), cents: toCents(deltaPaid) },
            remaining: { reais: round2(deltaRemaining), cents: toCents(deltaRemaining) },
          },
        };
        // eslint-disable-next-line no-console
        console.warn(
          `[cycle-consistency] Divergência de fatura para cartão${name}${label}\n` +
            `  cardId=${input.cardId} periodKey=${input.periodKey}\n` +
            `  ${otherSource}: total=R$ ${fmt(other.total)} (${toCents(other.total)}¢) · pago=R$ ${fmt(other.paid)} (${toCents(other.paid)}¢) · faltam=R$ ${fmt(other.remaining)} (${toCents(other.remaining)}¢)\n` +
            `  ${input.source}: total=R$ ${fmt(snap.total)} (${toCents(snap.total)}¢) · pago=R$ ${fmt(snap.paid)} (${toCents(snap.paid)}¢) · faltam=R$ ${fmt(snap.remaining)} (${toCents(snap.remaining)}¢)\n` +
            `  Δ ${input.source}-${otherSource}: total=${signed(deltaTotal)} (${signedCents(deltaTotal)}¢) · pago=${signed(deltaPaid)} (${signedCents(deltaPaid)}¢) · faltam=${signed(deltaRemaining)} (${signedCents(deltaRemaining)}¢)`,
          meta,
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
