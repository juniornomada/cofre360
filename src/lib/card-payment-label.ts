/**
 * Fonte única de verdade para o texto de descrição de pagamentos de cartão.
 *
 * Formato canônico:
 *   - "Pagamento Total cartão <Nome>"
 *   - "Pagamento Parcial cartão <Nome>"
 *
 * Normaliza:
 *   - Espaçamento: colapsa qualquer whitespace (inclui NBSP U+00A0 e quebras
 *     de linha) em um único espaço ASCII e remove espaços das pontas.
 *   - Capitalização: "Pagamento" e "cartão" seguem a grafia fixa acima —
 *     apenas "Total"/"Parcial" variam. O nome do cartão é preservado como
 *     digitado pelo usuário (após o trim + collapse).
 *   - Quebras de linha: proibidas dentro do rótulo. Qualquer `\n` / `\r` /
 *     `\t` presente no nome do cartão vira um espaço.
 *   - Acento: "cartão" sempre com "ã". A palavra legada "fatura" NUNCA
 *     aparece — mesmo que o nome bruto do cartão contenha o token, o rótulo
 *     é montado a partir do template fixo (o nome do cartão entra apenas no
 *     final).
 */

export type CardPaymentKind = "total" | "partial";

/** Colapsa qualquer whitespace Unicode em um único espaço ASCII. */
function collapseWhitespace(input: string): string {
  return input.replace(/\s+/gu, " ").trim();
}

/**
 * Sanitiza o nome do cartão para uso dentro do rótulo:
 *  - remove whitespace nas pontas;
 *  - colapsa quebras de linha, tabs e espaços múltiplos;
 *  - descarta caracteres de controle (C0/C1) que podem entrar via colagem.
 */
export function sanitizeCardName(rawName: string | null | undefined): string {
  if (rawName == null) return "";
  // Strip C0 controls (0x00-0x1F excluding whitespace normalized below) and DEL.
  // eslint-disable-next-line no-control-regex
  const noControls = String(rawName).replace(/[\u0000-\u001F\u007F]/g, " ");
  return collapseWhitespace(noControls);
}

/**
 * Constrói a descrição de um pagamento de cartão no formato canônico.
 * Retorna string vazia se o nome resultar vazio após sanitização — o
 * caller deve tratar esse caso (ex.: exigir cartão selecionado antes de
 * criar o lançamento).
 */
export function formatCardPaymentLabel(
  kind: CardPaymentKind,
  cardName: string | null | undefined,
): string {
  const name = sanitizeCardName(cardName);
  if (!name) return "";
  const prefix = kind === "total" ? "Pagamento Total" : "Pagamento Parcial";
  return `${prefix} cartão ${name}`;
}

/**
 * Regex canônica que reconhece o rótulo — útil em testes e migrações.
 * Aceita apenas a grafia oficial (case-sensitive).
 */
export const CARD_PAYMENT_LABEL_REGEX =
  /^Pagamento (Total|Parcial) cartão .+\S$/;

/**
 * Detecta o rótulo legado — "Pagamento (Total|Parcial) fatura cartão <Nome>" —
 * em qualquer capitalização, com espaços múltiplos, NBSP, dashes/underscores
 * entre "fatura" e "cartão", "cartao" sem acento etc. Usado apenas para
 * fallback de renderização: dados são migrados no banco, mas transações
 * importadas ou copiadas de fontes antigas ainda podem chegar com o texto
 * legado. Este helper normaliza para o padrão canônico em tempo de UI.
 */
const LEGACY_CARD_PAYMENT_LABEL_REGEX =
  /^\s*pagamento\s+(total|parcial)\s+fatura(?:\s+(?:do|da|de))?\s+cart[aã]o\s+(.+?)\s*$/iu;

/**
 * Reformata rótulos legados para o padrão canônico no momento da renderização.
 * - Se `raw` já estiver no formato canônico, retorna `raw` intacto.
 * - Se casar com o padrão legado, remonta via `formatCardPaymentLabel` — o que
 *   também aplica sanitização de whitespace/controles no nome do cartão.
 * - Caso contrário (rótulo desconhecido), devolve o input inalterado. O
 *   caller deve continuar exibindo o texto original.
 *
 * Idempotente: `f(f(x)) === f(x)`.
 */
export function normalizeCardPaymentLabel(raw: string | null | undefined): string {
  if (raw == null) return "";
  const input = String(raw);
  if (CARD_PAYMENT_LABEL_REGEX.test(input)) return input;
  const match = LEGACY_CARD_PAYMENT_LABEL_REGEX.exec(input);
  if (!match) return input;
  const kind: CardPaymentKind = match[1].toLowerCase() === "total" ? "total" : "partial";
  const name = match[2];
  const canonical = formatCardPaymentLabel(kind, name);
  // Se a sanitização zerar o nome (ex.: só controles), preserva o input original
  // para não mascarar dados problemáticos com string vazia.
  return canonical || input;
}

