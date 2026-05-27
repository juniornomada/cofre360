import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

interface Props {
  value: number;
  onChange: (value: number) => void;
  /** Optional className for the input */
  className?: string;
  /** Optional autoFocus to set focus on the input */
  autoFocus?: boolean;
  /** Optional callback when Enter is pressed */
  onEnter?: () => void;
}

/**
 * Input component for currency (BRL) that uses the system keyboard.
 * Formats the value as "R$ 0,00" and shifts digits from right to left.
 */
export function CalculatorAmountInput({ value, onChange, className, autoFocus, onEnter }: Props) {
  // Internal "cents" buffer. e.g. 1234 → R$ 12,34
  const [cents, setCents] = useState<number>(() => Math.round((value || 0) * 100));
  const inputRef = useRef<HTMLInputElement>(null);

  const formattedValue = (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  // Sync internal state when value is changed externally
  useEffect(() => {
    const incoming = Math.round((value || 0) * 100);
    if (incoming !== cents) {
      setCents(incoming);
    }
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    // Extract only digits
    const digits = rawValue.replace(/\D/g, "");
    
    if (digits === "") {
      setCents(0);
      onChange(0);
      return;
    }

    const nextCents = parseInt(digits, 10);
    
    // Limit to R$ 9.999.999,99 (9 digits in cents)
    if (nextCents > 999_999_999) return;

    setCents(nextCents);
    onChange(nextCents / 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onEnter) {
      onEnter();
    }
    if (e.key === "Escape") {
      setCents(0);
      onChange(0);
    }
  };

  return (
    <div className="relative w-full">
      <Input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={formattedValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        autoFocus={autoFocus}
        className={cn(
          "text-right tabular-nums font-bold text-base text-primary h-[44px] bg-primary/5 border-primary/20 shadow-inner",
          "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          className
        )}
        aria-label={`Valor: ${formattedValue}`}
      />
    </div>
  );
}
