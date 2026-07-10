/**
 * Wrapper around `fc.assert` that, on failure, prints a clear reproduction
 * block: **seed**, **path** (shrink navigation), **numRuns**, and the
 * **shrunk counterexample** as JSON — plus a ready-to-copy snippet that
 * pins seed+path so the failure re-runs deterministically.
 *
 * fast-check already includes the seed/path/counterexample in its default
 * error message, but the format is dense and easy to miss when a suite
 * dumps many failures. This helper amplifies it and normalizes the copy.
 *
 * Usage — drop-in replacement:
 *
 *     await fcAssertWithRepro(
 *       fc.asyncProperty(arbA, arbB, async (a, b) => { ...expect(...)... }),
 *       { label: "P2 drift ≤ N¢" },     // opcional
 *       { numRuns: 200 },                // opções do fc.assert
 *     );
 *
 * Se `process.env.FC_SEED` estiver setado, o valor é aplicado como seed
 * (e opcionalmente `FC_PATH` como path) — útil para reproduzir localmente:
 *
 *     FC_SEED=1234567890 FC_PATH="12:3" bunx vitest run <arquivo>
 */
import fc from "fast-check";
import { expect } from "vitest";

type AnyProperty = Parameters<typeof fc.assert>[0];
type FcParams = Parameters<typeof fc.assert>[1];

export interface ReproOptions {
  /** Rótulo humano para localizar o teste no output. */
  label?: string;
  /** Se true, também loga o seed em execuções bem-sucedidas (debug). */
  logOnSuccess?: boolean;
}
export type FcAssertOptions = ReproOptions & NonNullable<FcParams>;


interface FcFailure {
  failed: boolean;
  seed?: number;
  path?: string;
  numRuns?: number;
  numShrinks?: number;
  counterexample?: unknown;
  error?: unknown;
  errorMessage?: string;
}

function pickEnvSeed(): { seed?: number; path?: string } {
  const rawSeed = process.env.FC_SEED;
  const rawPath = process.env.FC_PATH;
  const out: { seed?: number; path?: string } = {};
  if (rawSeed && rawSeed.trim()) {
    const n = Number(rawSeed);
    if (Number.isFinite(n)) out.seed = n;
  }
  if (rawPath && rawPath.trim()) out.path = rawPath.trim();
  return out;
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, (_k, val) => {
      if (typeof val === "bigint") return `${val.toString()}n`;
      if (typeof val === "function") return `[fn ${val.name || "anonymous"}]`;
      if (typeof val === "number" && !Number.isFinite(val)) {
        if (Number.isNaN(val)) return "NaN";
        return val > 0 ? "Infinity" : "-Infinity";
      }
      return val;
    }, 2);
  } catch {
    return String(v);
  }
}

export async function fcAssertWithRepro(
  property: AnyProperty,
  options: FcAssertOptions = {},
): Promise<void> {
  const { label: rawLabel, logOnSuccess, ...fcOpts } = options;
  const reproOpts: ReproOptions = { label: rawLabel, logOnSuccess };
  const envOverride = pickEnvSeed();
  const merged: FcParams = { ...fcOpts, ...envOverride };
  const label = reproOpts.label ?? "fast-check property";


  // Preferimos `fc.check` sobre `fc.assert` porque expõe programaticamente
  // seed, path, numRuns, numShrinks e o counterexample encolhido; assim o
  // relatório fica estruturado ao invés de dependermos do parsing da string.
  const out = (await fc.check(property, merged)) as unknown as FcFailure;

  if (!out.failed) {
    if (reproOpts.logOnSuccess) {
      // eslint-disable-next-line no-console
      console.log(`[fc:${label}] OK — seed=${out.seed} runs=${out.numRuns}`);
    }
    return;
  }

  const seed = out.seed;
  const path = out.path;
  const runs = out.numRuns;
  const shrinks = out.numShrinks;
  const ce = safeStringify(out.counterexample);
  const inner =
    out.errorMessage ??
    (out.error instanceof Error ? out.error.stack ?? out.error.message : String(out.error ?? "unknown"));

  const reproSnippet =
    `  await fcAssertWithRepro(prop, { label: ${JSON.stringify(label)} }, {\n` +
    `    seed: ${seed},\n` +
    (path ? `    path: ${JSON.stringify(path)},\n` : "") +
    `    endOnFailure: true,\n` +
    `  });`;

  const envSnippet =
    `  FC_SEED=${seed}` + (path ? ` FC_PATH=${JSON.stringify(path)}` : "") + " bunx vitest run <arquivo>";

  const banner = [
    "",
    `┌─ FUZZ FAILED — ${label}`,
    `│ seed        : ${seed}`,
    `│ path        : ${path ?? "(root)"}`,
    `│ numRuns     : ${runs}`,
    `│ numShrinks  : ${shrinks}`,
    `│ shrunk counterexample:`,
    ...ce.split("\n").map((l) => `│   ${l}`),
    `│ inner error :`,
    ...String(inner).split("\n").map((l) => `│   ${l}`),
    `├─ reproduzir via env vars:`,
    envSnippet,
    `├─ reproduzir hard-codando no teste:`,
    reproSnippet,
    `└─`,
    "",
  ].join("\n");

  // eslint-disable-next-line no-console
  console.error(banner);

  // Falha o teste com uma mensagem curta; o detalhe fica no console acima.
  expect.fail(
    `[fc:${label}] falhou — seed=${seed} path=${path ?? "root"} — ver bloco de reprodução acima.`,
  );
}
