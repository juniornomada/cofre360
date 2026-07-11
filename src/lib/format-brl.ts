/**
 * Formata um número como moeda BRL usando SEMPRE vírgula como separador decimal.
 * Ex.: 1 → "1,00"; 1234.5 → "1.234,50"
 */
export const formatBRL = (v: number | null | undefined): string => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0,00";
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

/**
 * Formata um valor monetário em BRL com prefixo "R$", separadores pt-BR
 * (milhar `.` / decimal `,`) e sinal explícito quando não-zero:
 *   0        → "R$ 0,00"
 *   1234.5   → "+R$ 1.234,50"   (crédito)
 *   -1234.5  → "-R$ 1.234,50"   (débito)
 *
 * O sinal fica ANTES do símbolo "R$" (padrão brasileiro contábil) e o
 * módulo é formatado a partir de `Math.abs` para evitar a saída
 * indesejada "R$ -1.234,50" produzida por `toLocaleString` puro.
 */
export const formatSignedBRL = (v: number | null | undefined): string => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "R$ 0,00";
  // Arredonda para 2 casas para tratar -0.004 como 0.
  const rounded = Math.round(n * 100) / 100;
  const abs = Math.abs(rounded).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (rounded === 0) return `R$ ${abs}`;
  const sign = rounded > 0 ? "+" : "-";
  return `${sign}R$ ${abs}`;
};
