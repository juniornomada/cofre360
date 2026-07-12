/**
 * Helpers de verificação de wording legada de pagamento de cartão para
 * uso em testes E2E (Playwright) e testes unitários. Extraído para
 * módulo próprio para que a normalização e os padrões possam ser
 * exercitados por Vitest sem depender do runner do Playwright.
 *
 * Contrato — `normalizeForCheck` deve produzir a forma na qual os
 * padrões `LEGACY_PAYMENT_LABEL_PATTERNS` são escritos:
 *   • minúsculo
 *   • sem diacríticos (ã, ç, é → a, c, e)
 *   • whitespace Unicode colapsado em um único espaço ASCII
 *   • zero-width / BOM completamente removidos (não viram espaço)
 *   • trim das pontas
 *   • formas de compatibilidade Unicode reduzidas (NFKC)
 *
 * Isso elimina duas classes de bug em asserções E2E:
 *   – Falso negativo: o app renderiza texto legado, mas com variação
 *     Unicode (NBSP, zero-width, combining diacritic separado) que a
 *     regex crua não casa → o teste passa erroneamente.
 *   – Falso positivo: o padrão casa um fragmento fora de contexto
 *     (ex.: nome de cartão contendo "fatura cartão"). Como escrevemos
 *     os padrões com boundaries e conectores fixos e comparamos apenas
 *     a versão normalizada, evitamos casar substrings acidentais.
 */

export function normalizeForCheck(raw: string): string {
  return raw
    .normalize("NFKC")
    .normalize("NFD")
    // Combining marks (diacríticos) fora.
    .replace(/\p{M}+/gu, "")
    // Zero-width e BOM: apagar (NÃO trocar por espaço).
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    // Todo whitespace Unicode → espaço ASCII único.
    .replace(/\s+/gu, " ")
    .toLowerCase()
    .trim();
}

/**
 * Padrões da wording legada — escritos JÁ normalizados (minúsculo, sem
 * acento, espaço único). Aceitam os conectores opcionais "do/da/de"
 * observados em produção entre "fatura" e "cartão".
 */
export const LEGACY_PAYMENT_LABEL_PATTERNS: readonly RegExp[] = [
  /pagamento parcial fatura(?: (?:do|da|de))? cartao\b/,
  /pagamento total fatura(?: (?:do|da|de))? cartao\b/,
];

/**
 * Retorna o primeiro match legado (índice + trecho) ou `null` quando o
 * texto está limpo. O caller normaliza uma única vez para permitir
 * mensagens de erro com contexto.
 */
export function findLegacyPaymentWording(
  raw: string,
): { pattern: RegExp; index: number; excerpt: string } | null {
  const normalized = normalizeForCheck(raw);
  for (const pattern of LEGACY_PAYMENT_LABEL_PATTERNS) {
    const m = pattern.exec(normalized);
    if (m) {
      const start = Math.max(0, m.index - 20);
      const end = Math.min(normalized.length, m.index + m[0].length + 20);
      return { pattern, index: m.index, excerpt: normalized.slice(start, end) };
    }
  }
  return null;
}
