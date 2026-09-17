/**
 * Normaliza e valida campos de uma transação antes de gravar no banco.
 * Além da descrição, mantém os campos DATE canônicos em YYYY-MM-DD,
 * mesmo quando a UI trabalha com formatos legados.
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

export class InvalidTransactionDateError extends Error {
  constructor(field: "purchase_date" | "transaction_date", value: string) {
    super(`Data inválida em ${field}: ${value}. Use uma data válida no formato DD/MM/AAAA.`);
    this.name = "InvalidTransactionDateError";
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

function buildCanonicalDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Tenta converter formatos conhecidos para PostgreSQL DATE.
 * Retorna undefined quando o texto legado não é reconhecido; isso permite
 * deixar o trigger do banco interpretar formatos históricos mais flexíveis.
 */
function tryCanonicalizeDate(raw: string | null | undefined): string | null | undefined {
  if (raw == null) return raw;
  const value = String(raw).trim();
  if (!value) return null;

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) {
    return buildCanonicalDate(Number(iso[1]), Number(iso[2]), Number(iso[3])) ?? undefined;
  }

  const dmy = value.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (dmy) {
    return buildCanonicalDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1])) ?? undefined;
  }

  return undefined;
}

function canonicalizeTypedDate(
  field: "purchase_date" | "transaction_date",
  raw: string | null | undefined,
): string | null | undefined {
  if (raw == null) return raw;
  const value = String(raw).trim();
  if (!value) return null;
  const canonical = tryCanonicalizeDate(value);
  if (!canonical) throw new InvalidTransactionDateError(field, value);
  return canonical;
}

/**
 * Sanitiza o payload de insert/update sem mutar o objeto original.
 * Campos PostgreSQL DATE explícitos são validados estritamente antes do banco.
 *
 * Quando um fluxo legado fornece apenas `date`, derivamos `transaction_date`
 * somente se o formato for inequívoco. Textos legados não reconhecidos ficam
 * intactos para o trigger `cofre_sync_transaction_canonical`, que possui parser
 * histórico próprio e retorna NULL em vez de provocar erro de cast.
 */
export function sanitizeTransactionWrite<T extends TransactionWriteShape>(row: T): T {
  const next: TransactionWriteShape = { ...row };

  if ("name" in row && row.name != null) {
    next.name = sanitizeTransactionName(row.name);
  }
  if ("purchase_date" in row) {
    next.purchase_date = canonicalizeTypedDate("purchase_date", row.purchase_date);
  }
  if ("transaction_date" in row) {
    next.transaction_date = canonicalizeTypedDate("transaction_date", row.transaction_date);
  } else if ("date" in row && row.date != null && String(row.date).trim() !== "") {
    const derived = tryCanonicalizeDate(row.date);
    if (derived) next.transaction_date = derived;
  }

  return next as T;
}

/** Variante para lotes (batch insert). */
export function sanitizeTransactionWrites<T extends TransactionWriteShape>(rows: T[]): T[] {
  return rows.map((row) => sanitizeTransactionWrite(row));
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
