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
