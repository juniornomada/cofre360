/**
 * Normaliza e valida campos de uma transação antes de gravar no banco.
 * Além da descrição, mantém os campos DATE canônicos em YYYY-MM-DD,
 * mesmo quando a UI trabalha com dd-MM-yyyy ou dd/MM/yyyy.
 */

import {
  normalizeCardPaymentLabel,
  CARD_PAYMENT_LABEL_REGEX,
} from "./card-payment-label";

const LEGACY_TOKEN_REGEX = /pagamento\s+(?:total|parcial)\s+fatura(?:\s+(?:do|da|de))?\s+cart[aã]o/iu;

type TransactionWriteShape = {
  name?: string | null;
  date?: string | null;
  purchase_date?: string | null;
  transaction_date?: string | null;
};

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
 * Converte datas de escrita para o formato aceito por colunas PostgreSQL DATE.
 * A propriedade legada `date` continua intacta porque ainda é usada para
 * apresentação/compatibilidade em partes do aplicativo.
 */
function canonicalizeDateForWrite(
  raw: string | null | undefined,
): string | null | undefined {
  if (raw == null) return raw;

  const value = String(raw).trim();
  if (!value) return null;

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    ) {
      return value;
    }
    return value;
  }

  const dmy = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!dmy) return value;

  const day = Number(dmy[1]);
  const month = Number(dmy[2]);
  const year = Number(dmy[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return value;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Sanitiza o payload de insert/update sem mutar o objeto original.
 * `purchase_date` e `transaction_date` são colunas DATE no schema atual e
 * precisam sair da UI no formato canônico YYYY-MM-DD.
 *
 * Em inserts vindos das telas antigas, `transaction_date` pode não existir no
 * objeto. Nesses casos ele é derivado de `date`, evitando depender do parser
 * legado do banco para persistir a data canônica.
 */
export function sanitizeTransactionWrite<T extends TransactionWriteShape>(
  row: T,
): T {
  const next: TransactionWriteShape = { ...row };

  if ("name" in row && row.name != null) {
    next.name = sanitizeTransactionName(row.name);
  }
  if ("purchase_date" in row) {
    next.purchase_date = canonicalizeDateForWrite(row.purchase_date);
  }
  if ("transaction_date" in row) {
    next.transaction_date = canonicalizeDateForWrite(row.transaction_date);
  } else if ("date" in row && row.date != null && String(row.date).trim() !== "") {
    next.transaction_date = canonicalizeDateForWrite(row.date);
  }

  return next as T;
}

/** Variante para lotes (batch insert). */
export function sanitizeTransactionWrites<T extends TransactionWriteShape>(
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
