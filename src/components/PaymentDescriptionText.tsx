import { AutoFitText, type AutoFitTextProps } from "@/components/AutoFitText";
import { normalizeCardPaymentLabel } from "@/lib/card-payment-label";

/**
 * PaymentDescriptionText
 * ----------------------------------------------------------------
 * Wrapper padronizado para renderizar descrições de transações /
 * pagamentos em toda a aplicação. Toda descrição visível ao usuário
 * deve passar por este componente para garantir:
 *
 *  1. **Normalização canônica de wording** — aplica
 *     `normalizeCardPaymentLabel` antes de renderizar, o que reescreve
 *     rótulos legados ("Pagamento Parcial fatura cartão X") para o
 *     formato atual ("Pagamento Parcial cartão X") em runtime, mesmo
 *     que a persistência antiga escape.
 *  2. **Remoção opcional do sufixo de parcela** ("(3/12)") para
 *     evitar ruído quando o mesmo indicador já é renderizado ao lado
 *     como badge separado. Ativado por `stripInstallmentSuffix`.
 *  3. **Comportamento consistente de quebra + tooltip** — delega ao
 *     `AutoFitText`, então a fonte encolhe até o piso legível e, se
 *     ainda transbordar, cai para ellipsis/line-clamp com `title`
 *     nativo carregando o texto integral.
 *
 * Uso recomendado em qualquer lista/dialog que exiba descrição de
 * transação, incluindo /cards, /accounts, /transactions, /reminders,
 * imports de CSV/PDF, etc. Substitui o antigo `<p class="truncate">`.
 */

const INSTALLMENT_SUFFIX_RE = /\s*\(\s*\d{1,2}\s*\/\s*\d{1,2}\s*\)\s*$/;

export interface PaymentDescriptionTextProps
  extends Omit<AutoFitTextProps, "children" | "titleFallback"> {
  /** Texto bruto a normalizar e renderizar. `null`/`undefined` viram fallback. */
  name: string | null | undefined;
  /** Se `true`, remove sufixo "(N/M)" do fim antes de renderizar. Default `false`. */
  stripInstallmentSuffix?: boolean;
  /** Texto exibido quando `name` estiver vazio. Default "(sem descrição)". */
  emptyFallback?: string;
  /** Sobrescreve o `title` de fallback do AutoFitText. */
  titleFallback?: string;
}

export function normalizePaymentDescription(
  raw: string | null | undefined,
  options: { stripInstallmentSuffix?: boolean } = {},
): string {
  const base = normalizeCardPaymentLabel(raw ?? "");
  if (!options.stripInstallmentSuffix) return base;
  return base.replace(INSTALLMENT_SUFFIX_RE, "").trim();
}

export function PaymentDescriptionText({
  name,
  stripInstallmentSuffix = false,
  emptyFallback = "(sem descrição)",
  titleFallback,
  ...autoFitProps
}: PaymentDescriptionTextProps) {
  const normalized = normalizePaymentDescription(name, { stripInstallmentSuffix });
  const display = normalized.length > 0 ? normalized : emptyFallback;
  return (
    <AutoFitText titleFallback={titleFallback ?? display} {...autoFitProps}>
      {display}
    </AutoFitText>
  );
}
