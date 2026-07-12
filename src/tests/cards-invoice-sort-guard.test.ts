import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guarda estática de regressão.
 *
 * A ordenação da lista da fatura em /cards deve seguir a cascata canônica
 * (parseTxDate → created_at → id) implementada em:
 *
 *   - src/lib/invoice-chrono-sort.ts        (helpers sortInvoiceChronoAsc / compareInvoiceChrono)
 *   - src/routes/cards.tsx                  (query com .order(date).order(created_at).order(id))
 *
 * Reintroduzir `.sort((a, b) => ...)` inline nos arquivos de cartões que
 * compare `date`/`created_at`/`parseTxDate` sem passar pelos helpers quebra
 * silenciosamente o desempate por `created_at` e `id`. Este teste falha
 * quando qualquer arquivo escaneado contém um sort desses sem uso do helper
 * canônico e sem o marcador explícito de opt-out `// invoice-order-safe:`.
 *
 * Opt-out legítimo (raro, e SEMPRE justificado no comentário na linha
 * imediatamente anterior):
 *
 *   // invoice-order-safe: <motivo breve>
 *   const ordered = [...arr].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
 *
 * Escopo do guard: arquivos que renderizam a lista da fatura ou compõem
 * seus itens. Amplie a lista abaixo quando novos componentes forem criados.
 */

const SCAN_TARGETS: string[] = [
  "src/routes/cards.tsx",
  "src/components/cards",
];

const SUSPICIOUS_TOKENS = [
  /\.date\b/,
  /\.created_at\b/,
  /parseTxDate\s*\(/,
  /invoiceChronoKey\s*\(/,
];

const CANONICAL_TOKENS = [
  /compareInvoiceChrono\b/,
  /sortInvoiceChronoAsc\b/,
];

const OPT_OUT_MARKER = /invoice-order-safe\s*:/;

function collectFiles(target: string): string[] {
  let stat;
  try {
    stat = statSync(target);
  } catch {
    return [];
  }
  if (stat.isFile()) return [target];
  const out: string[] = [];
  for (const name of readdirSync(target)) {
    if (name.startsWith(".")) continue;
    const full = join(target, name);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...collectFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

interface Violation {
  file: string;
  line: number;
  snippet: string;
  reason: string;
}

function scanFile(file: string): Violation[] {
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  const violations: Violation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/\.sort\s*\(/.test(line)) continue;

    // Contexto de análise: linha atual + próximas 2 (comparadores multilinha).
    const window = lines.slice(i, Math.min(lines.length, i + 3)).join("\n");
    const looksLikeTxSort = SUSPICIOUS_TOKENS.some((rx) => rx.test(window));
    if (!looksLikeTxSort) continue;

    // Aceito se o próprio bloco usa o helper canônico.
    if (CANONICAL_TOKENS.some((rx) => rx.test(window))) continue;

    // Aceito com opt-out explícito na linha imediatamente anterior.
    const prev = i > 0 ? lines[i - 1] : "";
    if (OPT_OUT_MARKER.test(prev)) continue;

    violations.push({
      file,
      line: i + 1,
      snippet: line.trim(),
      reason:
        "Sort inline sobre transações não usa compareInvoiceChrono/sortInvoiceChronoAsc " +
        "e não tem o marcador `// invoice-order-safe: <motivo>` na linha anterior.",
    });
  }

  return violations;
}

describe("guarda: ordenação da fatura em /cards não pode ser reintroduzida inline", () => {
  it("nenhum arquivo escaneado contém .sort() de transações fora da cascata canônica", () => {
    const files = SCAN_TARGETS.flatMap(collectFiles);
    // Sanity: pelo menos cards.tsx foi coletado.
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain("src/routes/cards.tsx");

    const violations = files.flatMap(scanFile);
    if (violations.length > 0) {
      const msg = violations
        .map((v) => `  ${v.file}:${v.line}\n    ${v.snippet}\n    → ${v.reason}`)
        .join("\n");
      throw new Error(
        `Violações da cascata de ordenação canônica encontradas:\n${msg}\n\n` +
          "Use sortInvoiceChronoAsc/compareInvoiceChrono de @/lib/invoice-chrono-sort " +
          "ou, se realmente não for uma lista de transações da fatura, marque a linha " +
          "anterior com `// invoice-order-safe: <motivo>`.",
      );
    }
    expect(violations).toEqual([]);
  });

  it("query de transações em cards.tsx mantém a tríade .order(date) → .order(created_at) → .order(id)", () => {
    const src = readFileSync("src/routes/cards.tsx", "utf8");
    // Localiza a chamada `.from("transactions")` que traz cartões (não a de bank_account_id).
    const fromCalls = src.match(/\.from\(["']transactions["']\)[^;]+;/g) ?? [];
    const cardTxQuery = fromCalls.find((q) => q.includes('not("card"'));
    expect(cardTxQuery, "query .from(\"transactions\") ... not(\"card\", is, null) deve existir").toBeTruthy();
    expect(cardTxQuery!).toMatch(/\.order\(\s*["']date["']\s*,/);
    expect(cardTxQuery!).toMatch(/\.order\(\s*["']created_at["']\s*,/);
    expect(cardTxQuery!).toMatch(/\.order\(\s*["']id["']\s*,/);
  });

  it("o marcador `invoice-order-safe:` só pode ser aplicado a linhas com .sort() (evita opt-out fantasma)", () => {
    const files = SCAN_TARGETS.flatMap(collectFiles);
    const ghost: Array<{ file: string; line: number; snippet: string }> = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (!OPT_OUT_MARKER.test(lines[i])) continue;
        const next = lines[i + 1] ?? "";
        if (!/\.sort\s*\(/.test(next)) {
          ghost.push({ file, line: i + 1, snippet: lines[i].trim() });
        }
      }
    }
    expect(ghost, `Marcador invoice-order-safe sem .sort() logo abaixo: ${JSON.stringify(ghost, null, 2)}`).toEqual([]);
  });
});
