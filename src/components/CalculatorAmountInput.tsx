import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export type AmountInputTone = "expense" | "income" | "transfer";

interface Props {
  value: number;
  onChange: (value: number) => void;
  /** Semantic visual tone for the transaction amount. */
  tone?: AmountInputTone;
  /** Optional className for the input */
  className?: string;
  /** Optional autoFocus to set focus on the input */
  autoFocus?: boolean;
  /** Optional callback when Enter is pressed */
  onEnter?: () => void;
}

function formatCurrency(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toEditableValue(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function sanitizeEditableValue(raw: string) {
  // Campo monetário natural: aceita apenas dígitos e um separador decimal.
  const cleaned = raw.replace(/[^0-9,.]/g, "");
  const separatorIndex = cleaned.search(/[,.]/);
  if (separatorIndex < 0) return cleaned.slice(0, 9);

  const integer = cleaned.slice(0, separatorIndex).replace(/\D/g, "").slice(0, 9);
  const decimals = cleaned.slice(separatorIndex + 1).replace(/\D/g, "").slice(0, 2);
  return `${integer},${decimals}`;
}

function parseEditableValue(raw: string) {
  if (!raw || raw === ",") return 0;
  const normalized = raw.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

/**
 * Campo BRL editável como um input numérico normal.
 * - foco seleciona o valor inteiro para permitir sobrescrever digitando;
 * - seleção/cursor continuam livres depois disso;
 * - permite apagar tudo ou editar parcialmente;
 * - formata novamente como moeda ao sair do campo.
 */
export function CalculatorAmountInput({ value, onChange, tone, className, autoFocus, onEnter }: Props) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => toEditableValue(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused) setDraft(toEditableValue(value));
  }, [value, focused]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = sanitizeEditableValue(e.target.value);
    setDraft(next);
    onChange(parseEditableValue(next));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onEnter) onEnter();
    if (e.key === "Escape") {
      setDraft("");
      onChange(0);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(true);
    setDraft(toEditableValue(value));
    // O primeiro toque/clique seleciona tudo: basta digitar para sobrescrever.
    requestAnimationFrame(() => e.target.select());
  };

  const handleBlur = () => {
    setFocused(false);
    setDraft(toEditableValue(value));
  };

  const toneClassName = tone === "expense"
    ? "!text-red-500 !border-red-500 focus-visible:!ring-red-500"
    : tone === "income"
      ? "!text-green-600 dark:!text-green-500 !border-green-600 dark:!border-green-500 focus-visible:!ring-green-600 dark:focus-visible:!ring-green-500"
      : tone === "transfer"
        ? "!text-black dark:!text-white !border-black dark:!border-white focus-visible:!ring-black dark:focus-visible:!ring-white"
        : "";

  const formattedValue = formatCurrency(value);

  return (
    <div className="relative w-full">
      <Input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={focused ? draft : formattedValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        autoFocus={autoFocus}
        className={cn(
          "text-right tabular-nums font-bold text-base text-primary h-[44px] bg-primary/5 border-primary/20 shadow-inner",
          "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          toneClassName,
          className
        )}
        aria-label={`Valor: ${formattedValue}`}
      />
    </div>
  );
}
