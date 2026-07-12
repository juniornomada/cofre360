#!/usr/bin/env node
/**
 * Guard: no legacy card-payment wording anywhere in the repo.
 *
 * Product decision: descrições de pagamento de cartão devem seguir o
 * formato canônico:
 *
 *   "Pagamento Parcial cartão <Nome>"
 *   "Pagamento Total cartão <Nome>"
 *
 * A wording legada — com a palavra "fatura" no meio — não pode
 * reaparecer no código de produção, nas migrations, nos seeds nem em
 * documentação/relatórios do usuário final.
 *
 * Escopo do scan:
 *   • Todo o repositório, exceto diretórios de build/cache/deps.
 *   • Inclui explicitamente supabase/migrations/**  e supabase/seed*.
 *
 * Regex proibida (case-insensitive, tolerante a espaços):
 *   /Pagamento\s+(Parcial|Total)\s+fatura\s+cart[aã]o/iu
 *
 * Allowlist (arquivos que citam a wording legada de propósito como
 * regressão-guard):
 *   • scripts/check-payment-wording.mjs (este arquivo)
 *   • src/tests/payment-description-copy.test.ts
 *   • src/tests/card-payment-label-navigation-integration.test.ts
 *   • src/tests/card-payment-label.test.ts
 *   • e2e/cards-payment-wording.spec.ts
 *
 * Para adicionar uma nova exceção, edite `ALLOWLIST` abaixo e
 * documente o motivo em code review.
 *
 * Uso:
 *   node scripts/check-payment-wording.mjs
 * Sai com código 1 se qualquer ocorrência não-allowlisted for encontrada.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();

const LEGACY_RX = /Pagamento\s+(Parcial|Total)\s+fatura\s+cart[aã]o/iu;

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".vite",
  ".output",
  ".wrangler",
  "coverage",
  "playwright-report",
  "test-results",
  ".husky",
  ".idea",
  ".vscode",
]);

// Extensões escaneadas — código, config, docs, SQL, seeds, snapshots.
const SCANNED_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".jsonc",
  ".md", ".mdx",
  ".sql",
  ".yml", ".yaml",
  ".html", ".css",
  ".txt",
  ".toml",
]);

const ALLOWLIST = new Set([
  "scripts/check-payment-wording.mjs",
  "src/tests/payment-description-copy.test.ts",
  "src/tests/card-payment-label-navigation-integration.test.ts",
  "src/tests/card-payment-label.test.ts",
  "e2e/cards-payment-wording.spec.ts",
]);

function toPosix(p) {
  return p.split(sep).join("/");
}

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (IGNORED_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, out);
    } else if (st.isFile()) {
      const dot = name.lastIndexOf(".");
      const ext = dot >= 0 ? name.slice(dot) : "";
      if (SCANNED_EXT.has(ext)) out.push(full);
    }
  }
}

const files = [];
walk(ROOT, files);

const violations = [];
for (const abs of files) {
  const rel = toPosix(relative(ROOT, abs));
  if (ALLOWLIST.has(rel)) continue;
  let content;
  try {
    content = readFileSync(abs, "utf8");
  } catch {
    continue;
  }
  if (!LEGACY_RX.test(content)) continue;
  const lines = content.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (LEGACY_RX.test(line)) {
      violations.push({ file: rel, line: i + 1, text: line.trim().slice(0, 200) });
    }
  });
}

if (violations.length > 0) {
  console.error(
    "\u2717 Wording legada de pagamento detectada. Use o formato canônico " +
      '"Pagamento {Parcial|Total} cartão <Nome>" (sem "fatura").\n',
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}: ${v.text}`);
  }
  console.error(
    `\nTotal: ${violations.length} ocorrência(s).\n` +
      "Se for um guard-test legítimo, adicione o caminho ao ALLOWLIST " +
      "em scripts/check-payment-wording.mjs com justificativa em review.",
  );
  process.exit(1);
}

console.log(
  `\u2713 Sem wording legada de pagamento. Escaneados ${files.length} arquivo(s); ` +
    `allowlist com ${ALLOWLIST.size} exceção(ões) documentada(s).`,
);
