/**
 * Constrói os argumentos de navegação para "Adicionar transação" a partir de um
 * período de fatura. Uso: onAdd do InvoiceEmptyState / botão FAB da fatura.
 *
 * Regras de pré-seleção:
 *   - action: "add"        → dispara a abertura do QuickAddTransactionDialog
 *   - type:   "expense"    → despesa é o único tipo válido em fatura de cartão
 *   - card:   nome do cartão da fatura (chave usada por transactions.card)
 *   - date:   fim do período em "dd MMM" (pt-BR) — mantém a nova transação
 *             dentro da fatura visualizada
 *
 * Se `endDate` for inválida, `date` é omitida (a UI cai no default "hoje").
 * Se `cardName` estiver vazio/undefined, `card` é omitida (usuário escolhe).
 */
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface AddTransactionNavArgs {
  action: "add";
  type: "expense";
  card?: string;
  date?: string;
}

export function buildAddTransactionNavArgs(
  cardName: string | null | undefined,
  endDate: Date | null | undefined,
): AddTransactionNavArgs {
  const args: AddTransactionNavArgs = { action: "add", type: "expense" };
  if (cardName && cardName.trim().length > 0) {
    args.card = cardName;
  }
  if (endDate instanceof Date && !Number.isNaN(endDate.getTime())) {
    args.date = format(endDate, "dd MMM", { locale: ptBR });
  }
  return args;
}
