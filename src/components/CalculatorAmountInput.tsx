import { useState, useEffect, useRef } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

 interface Props {
   value: number;
   onChange: (value: number) => void;
   /** Optional className for the displayed value button */
   className?: string;
   /** Optional autoFocus to set focus on the input button */
   autoFocus?: boolean;
   /** Optional callback when Enter is pressed and keypad is closed */
   onEnter?: () => void;
 }

/**
 * POS-style amount input: displays "R$ 0,00" and opens a numeric keypad on click.
 * Each digit shifts existing digits one decimal place to the left (cents-first entry):
 *   press 1     → 0,01
 *   press 1,0   → 0,10
 *   press 1,0,0 → 1,00
 * Backspace removes the last digit. The user types in cents internally.
 */
 export function CalculatorAmountInput({ value, onChange, className, autoFocus, onEnter }: Props) {
  // Internal "cents" buffer. e.g. 1234 → R$ 12,34
   const [cents, setCents] = useState<number>(() => Math.round((value || 0) * 100));
   const [hasStartedTyping, setHasStartedTyping] = useState(false);
   const [open, setOpen] = useState(false);
   const [isMobile, setIsMobile] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
     const openRef = useRef(false);
     const inputRef = useRef<HTMLInputElement>(null);
     const ignoreNextFocus = useRef(false);

    // Detect if we are on mobile
    useEffect(() => {
      const checkMobile = () => {
        setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
      };
      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Keep a ref to the open state for the event handler
    useEffect(() => {
      openRef.current = open;
    }, [open]);
   const buttonRef = useRef<HTMLButtonElement>(null);
   const firstKeypadButtonRef = useRef<HTMLButtonElement>(null);
   const lastKeypadButtonRef = useRef<HTMLButtonElement>(null);
    const [announcement, setAnnouncement] = useState("");

    const formatted = (cents / 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    useEffect(() => {
      if (autoFocus && !open && !ignoreNextFocus.current) {
        if (isMobile) {
          inputRef.current?.focus();
        } else {
          buttonRef.current?.focus();
        }
      }
    }, [autoFocus, open, isMobile]);

    // Manage focus and accessibility announcements when keypad opens/closes
    useEffect(() => {
      if (open) {
        setAnnouncement(`Modo de edição de valor ativado. Valor atual: R$ ${formatted}`);
        // Focus the first button in the keypad (number 1)
        setTimeout(() => firstKeypadButtonRef.current?.focus(), 10);
      } else {
        if (announcement !== "") {
          setAnnouncement(`Modo de edição encerrado. Valor selecionado: R$ ${formatted}`);
        }
        // Return focus to the main value button when closing
        buttonRef.current?.focus();
      }
    }, [open]);

  // Keep internal buffer in sync when the parent resets the value (e.g. dialog reopen).
  // Sync internal state when value is changed externally (e.g. parent reset)
  // We check hasStartedTyping to avoid resetting while the user is actively typing
  useEffect(() => {
    const incoming = Math.round((value || 0) * 100);
    if (incoming !== cents && !hasStartedTyping) {
      setCents(incoming);
    }
  }, [value, hasStartedTyping, cents]);

  // Reset hasStartedTyping when keypad closes
  useEffect(() => {
    if (!open) {
      setHasStartedTyping(false);
    }
  }, [open]);

  // Update announcement when cents change while open
  useEffect(() => {
    if (open) {
      setAnnouncement(`Valor atual: R$ ${formatted}`);
    }
  }, [cents, open, formatted]);

  // Propagate changes upward immediately for sync with parent
  // Removed useEffect-based propagation to avoid race conditions with Save buttons
  // Now handled directly in input.onChange and keypad.press/backspace/clear

  const confirm = () => {
    const reais = Math.round(cents) / 100;
    onChange(reais);
    setOpen(false);
    setHasStartedTyping(false);
  };

  const cancel = () => {
    setCents(Math.round((value || 0) * 100));
    setOpen(false);
    setHasStartedTyping(false);
  };

  // Close keypad when clicking outside.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!openRef.current) return;
      
      // Check if the click target is the theme toggle
      const isThemeToggle = (e.target as HTMLElement).closest('[aria-label*="tema"]');
      if (isThemeToggle) return;

      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

   const press = (digit: number) => {
     setCents(prev => {
       // If first digit after opening and not manually cleared, start fresh
       const base = hasStartedTyping ? prev : 0;
       const next = base * 10 + digit;
       
       if (!hasStartedTyping) setHasStartedTyping(true);
       
      // Cap at ~9 digits to avoid runaway numbers (R$ 9.999.999,99)
      if (next > 999_999_999) return prev;
      return next;
    });
  };

   const backspace = () => {
     if (!hasStartedTyping) setHasStartedTyping(true);
     setCents(prev => Math.floor(prev / 10));
   };
   const clear = () => {
     setHasStartedTyping(true);
     setCents(0);
   };

   // Keyboard support and Focus Trap
   useEffect(() => {
     const handler = (e: KeyboardEvent) => {
       const isFocused = containerRef.current?.contains(document.activeElement);
       if (!open && !isFocused) return;
 
        if (open && e.key === "Tab") {
          const first = firstKeypadButtonRef.current;
          const last = lastKeypadButtonRef.current;
          const container = containerRef.current;
          const active = document.activeElement;

          if (e.shiftKey) { // Shift + Tab
            if (active === first || (container && !container.contains(active))) {
              e.preventDefault();
              last?.focus();
            }
          } else { // Tab
            if (active === last || (container && !container.contains(active))) {
              e.preventDefault();
              first?.focus();
            }
          }
          return;
        }
 
       if (e.key >= "0" && e.key <= "9") {
         e.preventDefault();
         if (!open) setOpen(true);
         press(parseInt(e.key, 10));
       } else if (e.key === "Backspace") {
         e.preventDefault();
         backspace();
       } else if (e.key === "Escape") {
         if (open) {
           e.preventDefault();
           setOpen(false);
         } else {
           clear();
         }
        } else if (e.key === "Enter") {
          e.preventDefault(); // Always prevent default for Enter to control flow
          if (open) {
            const activeElement = document.activeElement;
            const isInsideKeypad = activeElement?.closest('#keypad-dialog');
            const isOkButton = activeElement?.getAttribute('data-category') === 'primary-action';
            const isCancelButton = activeElement?.textContent === 'Cancelar';
            
            if (isInsideKeypad) {
              if (isOkButton) {
                confirm();
              } else if (isCancelButton) {
                cancel();
              } else {
                // If focused on a digit or other button, just confirm the whole value
                confirm();
              }
            } else {
              confirm();
            }
          } else if (onEnter) {
            onEnter();
          }
       } else if (e.key === "ArrowUp") {
         e.preventDefault();
         if (!hasStartedTyping) setHasStartedTyping(true);
         setCents(prev => {
           const next = prev + 100;
           return next > 999_999_999 ? prev : next;
         });
       } else if (e.key === "ArrowDown") {
         e.preventDefault();
         if (!hasStartedTyping) setHasStartedTyping(true);
         setCents(prev => Math.max(0, prev - 100));
       }
     };
     window.addEventListener("keydown", handler, { capture: true });
     return () => window.removeEventListener("keydown", handler, { capture: true });
   }, [open, hasStartedTyping, onEnter]);

  return (
    <div ref={containerRef} className="relative">
      <div 
        id="input-instruction"
        className="sr-only" 
        aria-live="polite" 
        aria-atomic="true" 
      >
        Use o teclado do seu dispositivo para inserir o valor.
      </div>
      
      <div className={cn(
        "relative w-full rounded-lg bg-primary/5 px-2.5 py-2 transition-all flex items-center border border-primary/20 min-h-[44px] shadow-inner",
        "focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background focus-within:bg-primary/10 focus-within:border-primary/40",
        className
      )}>
        <span className="text-primary font-bold text-xs mr-2 shrink-0 opacity-80" aria-hidden="true">R$</span>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={formatted}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, "");
            const numVal = parseInt(raw, 10) || 0;
            if (numVal === cents) return;
            setCents(numVal);
            if (!hasStartedTyping) setHasStartedTyping(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) {
              onEnter();
            }
          }}
          className="flex-1 text-right tabular-nums font-bold bg-transparent border-none outline-none p-0 text-base text-primary w-full focus:ring-0 focus:outline-none"
          aria-label={`Valor: R$ ${formatted}`}
          aria-describedby="input-instruction"
        />
      </div>
    </div>
  );
}
