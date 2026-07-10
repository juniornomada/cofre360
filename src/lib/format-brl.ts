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
