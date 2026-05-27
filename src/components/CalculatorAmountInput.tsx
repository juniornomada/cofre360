import { useState, useEffect, useRef } from "react";
import { Delete, X, Check } from "lucide-react";
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
      style: "currency",
      currency: "BRL",
    });

    useEffect(() => {
      if (autoFocus && !open && !ignoreNextFocus.current) {
        buttonRef.current?.focus();
      }
    }, [autoFocus, open, isMobile]);

    // Manage focus and accessibility announcements when keypad opens/closes
    useEffect(() => {
      if (open) {
        setAnnouncement(`Modo de edição de valor ativado. Valor atual: ${formatted}`);
        // Focus the first button in the keypad (number 1)
        setTimeout(() => firstKeypadButtonRef.current?.focus(), 50);
      } else {
        if (announcement !== "") {
          setAnnouncement(`Modo de edição encerrado. Valor selecionado: ${formatted}`);
        }
        // Return focus to the main value button when closing, except on mobile to avoid keyboard issues
        buttonRef.current?.focus();
        
        // On mobile, explicitly blur after a short delay if it was focused
        if (isMobile) {
          setTimeout(() => {
            if (document.activeElement === buttonRef.current) {
              (document.activeElement as HTMLElement)?.blur();
            }
          }, 10);
        }
      }
    }, [open, isMobile]);

  // Keep internal buffer in sync when the parent resets the value (e.g. dialog reopen).
  // Sync internal state when value is changed externally (e.g. parent reset)
  // Sync internal state when value is changed externally (e.g. parent reset)
  useEffect(() => {
    const incoming = Math.round((value || 0) * 100);
    if (incoming !== cents) {
      setCents(incoming);
    }
  }, [value]);

  // Reset hasStartedTyping when keypad closes
  useEffect(() => {
    if (!open) {
      setHasStartedTyping(false);
    }
  }, [open]);

  // Update announcement when cents change while open
  useEffect(() => {
    if (open) {
      setAnnouncement(`Valor atual: ${formatted}`);
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
    // Ensure focus is dismissed on mobile
    if (isMobile) {
      (document.activeElement as HTMLElement)?.blur();
    }
  };

  const cancel = () => {
    setCents(Math.round((value || 0) * 100));
    setOpen(false);
    setHasStartedTyping(false);
    // Ensure focus is dismissed on mobile
    if (isMobile) {
      (document.activeElement as HTMLElement)?.blur();
    }
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
       const base = hasStartedTyping ? prev : 0;
       // Limit to R$ 9.999.999,99 (9 digits in cents)
       const next = base * 10 + digit;
       if (next > 999_999_999) return prev;
       
       const nextValue = next / 100;
       if (!hasStartedTyping) setHasStartedTyping(true);
       onChange(nextValue);
       return next;
     });
   };

   const backspace = () => {
     setCents(prev => {
       const next = Math.floor(prev / 10);
       const nextValue = next / 100;
       if (!hasStartedTyping) setHasStartedTyping(true);
       onChange(nextValue);
       return next;
     });
   };
   const clear = () => {
     setHasStartedTyping(true);
     setCents(0);
     onChange(0);
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
          const activeElement = document.activeElement;
          const isButton = activeElement?.tagName === 'BUTTON';
          
          if (open) {
            if (!isButton || activeElement?.getAttribute('data-category') === 'primary-action') {
              e.preventDefault();
              confirm();
              if (onEnter) setTimeout(onEnter, 50);
            }
          } else if (isFocused) {
            e.preventDefault();
            if (onEnter) {
              onEnter();
            } else {
              setOpen(true);
            }
          }
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
         if (!hasStartedTyping) setHasStartedTyping(true);
          setCents(prev => {
            const next = prev + 100;
            const final = next > 999_999_999 ? prev : next;
            const finalValue = final / 100;
            onChange(finalValue);
            return final;
          });
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          if (!hasStartedTyping) setHasStartedTyping(true);
          setCents(prev => {
            const next = Math.max(0, prev - 100);
            const finalValue = next / 100;
            onChange(finalValue);
            return next;
          });
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
      >
        Edição de valor monetário. Use os números de 0 a 9 para digitar. O valor é inserido em centavos da direita para a esquerda.
      </div>
      
      <div 
        data-testid="announcement-region"
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </div>

      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "relative w-full rounded-lg bg-primary/5 px-2.5 py-2 transition-all flex items-center border border-primary/20 min-h-[44px] shadow-inner",
          "hover:bg-primary/10 hover:border-primary/30",
          "focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background focus:outline-none",
          className
        )}
        aria-label={`Valor: ${formatted}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="keypad-dialog"
        aria-describedby="input-instruction"
      >
        <span className="flex-1 text-right tabular-nums font-bold text-base text-primary">
          {formatted}
        </span>
      </button>

      {/* OS Keyboard hidden input removed to prevent keyboard from popping up on mobile */}
      {/* Keypad Popover */}
      {open && (
        <div 
          id="keypad-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="keypad-title"
          className="absolute top-full left-0 right-0 z-[100] mt-2 rounded-2xl bg-background border border-border shadow-2xl p-4 animate-in fade-in zoom-in duration-200"
        >
          <h2 id="keypad-title" className="sr-only">Teclado numérico</h2>
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                ref={num === 1 ? firstKeypadButtonRef : null}
                type="button"
                onClick={() => press(num)}
                data-category="numeric"
                aria-label={num.toString()}
                className="h-12 rounded-xl bg-card hover:bg-accent text-lg font-bold transition-colors focus:ring-2 focus:ring-primary focus:outline-none"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={clear}
              data-category="destructive"
              aria-label="Limpar tudo"
              className="h-12 rounded-xl bg-destructive/10 hover:bg-destructive text-destructive hover:text-destructive-foreground text-lg font-bold transition-colors focus:ring-2 focus:ring-primary focus:outline-none"
            >
              C
            </button>
            <button
              type="button"
              onClick={() => press(0)}
              data-category="numeric"
              aria-label="0"
              className="h-12 rounded-xl bg-card hover:bg-accent text-lg font-bold transition-colors focus:ring-2 focus:ring-primary focus:outline-none"
            >
              0
            </button>
            <button
              type="button"
              onClick={backspace}
              data-category="utility"
              aria-label="Apagar"
              className="h-12 rounded-xl bg-card hover:bg-accent flex items-center justify-center transition-colors focus:ring-2 focus:ring-primary focus:outline-none"
            >
              <Delete className="h-5 w-5" />
            </button>

            {/* Actions */}
            <button
              type="button"
              onClick={cancel}
              data-category="secondary-action"
              aria-label="Cancelar"
              className="h-12 rounded-xl bg-muted hover:bg-muted/80 text-muted-foreground flex items-center justify-center transition-colors focus:ring-2 focus:ring-primary focus:outline-none"
            >
              <X className="h-5 w-5" />
            </button>
            <button
              ref={lastKeypadButtonRef}
              type="button"
              onClick={confirm}
              data-category="primary-action"
              aria-label="Confirmar"
              className="col-span-2 h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center transition-colors focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none"
            >
              <Check className="h-5 w-5" aria-hidden="true" />
              <span className="ml-2 font-bold">OK</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
