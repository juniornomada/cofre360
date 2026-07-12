/**
 * Normaliza e valida o campo `name` (descrição) de uma transação antes de
 * gravar no banco. Aplica:
 *   - trim + collapse de whitespace (inclui NBSP / quebras de linha / tabs);
 *   - remoção de caracteres de controle (C0/C1) que entram via colagem;
 *   - `normalizeCardPaymentLabel` para converter rótulos legados de
 *     pagamento de cartão ("Pagamento Parcial fatura cartão X") para o
 *     formato canônico ("Pagamento Parcial cartão X").
 *
 * Se, após normalização, o texto ainda contiver o token legado
 * "fatura cartão" em qualquer capitalização, lança um erro — impede que
 * variações não-cobertas pelo regex escapem para o banco.
 */

import {
  normalizeCardPaymentLabel,
  CARD_PAYMENT_LABEL_REGEX,
} from "./card-payment-label";

const LEGACY_TOKEN_REGEX = /pagamento\s+(?:total|parcial)\s+fatura(?:\s+(?:do|da|de))?\s+cart[aã]o/iu;

export class InvalidTransactionNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTransactionNameError";
  }
}

/**
 * Sanitiza a descrição de uma transação para persistência.
 * Retorna a string normalizada. Lança `InvalidTransactionNameError` se
 * o resultado for vazio ou ainda contiver o padrão legado.
 */
export function sanitizeTransactionName(raw: string | null | undefined): string {
  if (raw == null) {
    throw new InvalidTransactionNameError("Descrição obrigatória.");
  }
  // 1) Remove caracteres de controle (C0 + DEL)
  // eslint-disable-next-line no-control-regex
  const noControls = String(raw).replace(/[\u0000-\u001F\u007F]/g, " ");
  // 2) Colapsa whitespace Unicode em um único espaço ASCII
  const collapsed = noControls.replace(/\s+/gu, " ").trim();
  if (!collapsed) {
    throw new InvalidTransactionNameError("Descrição não pode ser vazia.");
  }
  // 3) Converte rótulo legado de pagamento de cartão para o canônico
  const normalized = normalizeCardPaymentLabel(collapsed);
  // 4) Guarda-final: se ainda casar com o padrão legado, recusa o payload
  if (LEGACY_TOKEN_REGEX.test(normalized)) {
    throw new InvalidTransactionNameError(
      "Descrição contém rótulo legado de pagamento de fatura; use o formato canônico.",
    );
  }
  return normalized;
}

/**
 * Aplica `sanitizeTransactionName` sobre o campo `name` de um payload de
 * insert/update. Retorna uma nova referência (não muta a original).
 * Se o payload não contiver `name`, retorna-o intacto — updates parciais
 * são permitidos.
 */
export function sanitizeTransactionWrite<T extends { name?: string | null }>(
  row: T,
): T {
  if (!("name" in row) || row.name == null) return row;
  return { ...row, name: sanitizeTransactionName(row.name) };
}

/** Variante para lotes (batch insert). */
export function sanitizeTransactionWrites<T extends { name?: string | null }>(
  rows: T[],
): T[] {
  return rows.map((r) => sanitizeTransactionWrite(r));
}

/**
 * Predicado utilizado por testes/CI: `true` se a string estiver no formato
 * canônico de pagamento de cartão OU não for um rótulo de pagamento (texto
 * livre do usuário). `false` apenas quando casa com o padrão legado.
 */
export function isValidTransactionName(raw: string): boolean {
  if (LEGACY_TOKEN_REGEX.test(raw)) return false;
  if (raw.trim() === "") return false;
  // Se começa com "Pagamento Total/Parcial cartão", exige forma canônica
  if (/^\s*pagamento\s+(total|parcial)\s+cart[aã]o/iu.test(raw)) {
    return CARD_PAYMENT_LABEL_REGEX.test(raw);
  }
  return true;
}
