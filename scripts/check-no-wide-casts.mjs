#!/usr/bin/env node
/**
 * Guard: no wide/unsafe casts in schema-versioning & drift surfaces.
 *
 * Motivação: casts amplos (`as any`, `as InstallmentPreview`, `as DriftMetric`,
 * `as unknown as X` fora do allowlist) já quebraram a suíte no passado
 * (TS2352). Este script falha o CI se algum reaparecer nos arquivos
 * críticos, preservando a tipagem estrita conquistada.
 *
 * Regras:
 *   - Escaneia src/lib/drift-input-mapper.ts, src/lib/__tests__/drift-*.ts
 *     e src/tests/patch-endpoint-schema-*.ts.
 *   - Proíbe:
 *       * `as any` (mesmo em comentário/JSDoc não conta; contamos apenas
 *         código: casamento simples de regex é suficiente aqui)
 *       * `as InstallmentPreview` / `as InstallmentPreview[]`
 *       * `as DriftMetric` / `as DriftAssertInput`
 *       * `<any>` (cast em prefixo TSX-off, defensivo)
 *   - Linhas com `// allow-wide-cast` no fim são ignoradas (fuga explícita
 *     e revisável), mas nenhuma delas deve existir por padrão.
 *
 * Uso:
 *   node scripts/check-no-wide-casts.mjs
 * Sai com código 1 se qualquer violação for encontrada.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = [
  "src/lib/drift-input-mapper.ts",
  "src/lib/__tests__",
  "src/tests",
];

const TARGET_PATTERNS = [
  /drift-input-mapper\.(runtime-zod\.)?test\.ts$/,
  /^drift-input-mapper\.ts$/,
  /patch-endpoint-schema-(versioning|negotiation|fallback)\.integration\.test\.ts$/,
];

const FORBIDDEN = [
  { name: "as any",                       re: /\bas\s+any\b/ },
  { name: "as InstallmentPreview",        re: /\bas\s+InstallmentPreview(\s*\[\s*\])?\b/ },
  { name: "as DriftMetric",               re: /\bas\s+DriftMetric\b/ },
  { name: "as DriftAssertInput",          re: /\bas\s+DriftAssertInput\b/ },
  { name: "angle-bracket <any>",          re: /<any>/ },
];

const ALLOW_MARKER = "allow-wide-cast";

function walk(path) {
  const out = [];
  let st;
  try { st = statSync(path); } catch { return out; }
  if (st.isFile()) { out.push(path); return out; }
  for (const entry of readdirSync(path)) out.push(...walk(join(path, entry)));
  return out;
}

function isTarget(file) {
  return TARGET_PATTERNS.some((re) => re.test(file));
}

const files = ROOTS.flatMap(walk).filter(isTarget);
if (files.length === 0) {
  console.error("check-no-wide-casts: no target files matched — aborting");
  process.exit(2);
}

const violations = [];
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    if (line.includes(ALLOW_MARKER)) return;
    // Ignora linhas puramente de comentário (// ou * dentro de bloco).
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
    for (const rule of FORBIDDEN) {
      if (rule.re.test(line)) {
        violations.push({ file, line: i + 1, rule: rule.name, text: trimmed });
      }
    }
  });
}

if (violations.length > 0) {
  console.error("\n✖ Wide/unsafe casts detected in schema-versioning & drift surfaces:\n");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]\n    ${v.text}`);
  }
  console.error(
    "\nRemove the cast, narrow the type, or (last resort) append // allow-wide-cast\n" +
    "on the exact line with a justification in code review.\n",
  );
  process.exit(1);
}

console.log(`✓ check-no-wide-casts: scanned ${files.length} files, 0 violations`);
