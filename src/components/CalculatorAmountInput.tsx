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
      if (autoFocus && !open) {
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
  useEffect(() => {
    const reais = Math.round(cents) / 100;
    if (reais !== value) {
      onChange(reais);
    }
  }, [cents, value, onChange]);

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
          data-testid="announcement-region"
        >
          {announcement || (isMobile ? "Use o teclado numérico para inserir o valor." : "Pressione Enter ou Espaço para editar o valor.")}
        </div>
        
        {isMobile ? (
          <div className={cn(
            "relative w-full rounded-lg bg-card px-2.5 py-1.5 transition-all flex items-center border border-transparent min-h-[36px]",
            "focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background",
            className
          )}>
            <span className="text-muted-foreground text-[10px] mr-1.5 shrink-0" aria-hidden="true">R$</span>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={formatted}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "");
                const numVal = parseInt(raw, 10) || 0;
                
                // If the value is the same, don't trigger state updates that might cause re-renders
                if (numVal === cents) return;
                
                setCents(numVal);
                if (!hasStartedTyping) setHasStartedTyping(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && onEnter) {
                  onEnter();
                }
              }}
              className="flex-1 text-right tabular-nums font-semibold bg-transparent border-none outline-none p-0 text-sm text-foreground w-full focus:ring-0 focus:outline-none"
              aria-label={`Valor: R$ ${formatted}`}
              aria-describedby="input-instruction"
            />
          </div>
        ) : (
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-haspopup="true"
            aria-expanded={open}
            aria-controls={open ? "keypad-dialog" : undefined}
            aria-label={`Valor: R$ ${formatted}. Selecionado.`}
            aria-describedby="input-instruction"
           className={cn(
             "w-full rounded-lg bg-card px-2.5 py-1.5 text-left text-xs text-foreground outline-none transition-all flex items-center justify-between",
             "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
             open && "ring-2 ring-primary bg-primary/5",
             className
           )}
         >
           <span className="text-muted-foreground text-[10px] mr-1.5" aria-hidden="true">R$</span>
           <span className="flex-1 text-right tabular-nums font-semibold">{formatted}</span>
         </button>
        )}

        {open && (
          <div 
            id="keypad-dialog"
            className="absolute z-50 left-0 right-0 top-full mt-1 rounded-lg bg-popover border border-border shadow-lg p-1.5 animate-in fade-in-0 zoom-in-95"
             role="dialog"
             aria-modal="true"
              aria-labelledby="keypad-title"
              aria-describedby="input-instruction"
           >
          <div 
            id="keypad-title"
            className="mb-1 rounded-md bg-card px-2 py-1 text-right tabular-nums text-xs font-bold text-foreground"
          >
            R$ {formatted}
          </div>
           <div className="grid grid-cols-3 gap-1" role="group" aria-label="Teclado numérico">
             {/* Numbers 1-9 */}
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n, idx) => (
               <button
                 key={n}
                 ref={idx === 0 ? firstKeypadButtonRef : null}
                 type="button"
                 onClick={() => press(n)}
               aria-label={`Número ${n}`}
                  data-category="numeric"
              className="rounded-md bg-card hover:bg-accent focus-visible:bg-accent focus-visible:ring-1 focus-visible:ring-primary active:scale-95 transition-all py-1 text-xs font-semibold text-foreground"
               >
                 {n}
               </button>
             ))}
             {/* Number 0 */}
             <button
               type="button"
               onClick={() => press(0)}
             aria-label="Número 0"
                data-category="numeric"
            className="rounded-md bg-card hover:bg-accent focus-visible:bg-accent focus-visible:ring-1 focus-visible:ring-primary active:scale-95 transition-all py-1 text-xs font-semibold text-foreground"
             >
               0
             </button>
             {/* Utility buttons always after numbers in Tab order */}
             <button
               type="button"
               onClick={clear}
                aria-label="Limpar todo o valor"
                data-category="destructive"
               className="rounded-md bg-card hover:bg-destructive/15 hover:text-destructive focus-visible:bg-destructive/15 focus-visible:text-destructive focus-visible:ring-1 focus-visible:ring-primary active:scale-95 transition-all py-1 text-[10px] font-semibold text-muted-foreground"
             >
               C
             </button>
             <button
               type="button"
               onClick={backspace}
               className="rounded-md bg-card hover:bg-accent focus-visible:bg-accent focus-visible:ring-1 focus-visible:ring-primary active:scale-95 transition-all py-1 text-foreground flex items-center justify-center"
               aria-label="Apagar último dígito"
                data-category="utility"
             >
               <Delete className="h-3 w-3" />
             </button>
           </div>
            <div className="flex gap-1 mt-1">
              <button
                type="button"
                onClick={cancel}
                className="flex-1 rounded-md bg-secondary text-secondary-foreground py-1 text-xs font-medium hover:bg-secondary/80 focus-visible:ring-1 focus-visible:ring-primary active:scale-[0.98] transition-all"
                aria-label="Cancelar e manter valor anterior"
                data-category="secondary-action"
              >
                Cancelar
              </button>
              <button
                ref={lastKeypadButtonRef}
                type="button"
                onClick={confirm}
                aria-label="Confirmar valor"
                data-category="primary-action"
                className="flex-1 rounded-md bg-primary text-primary-foreground py-1 text-xs font-medium hover:bg-primary/90 focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-1 active:scale-[0.98] transition-all"
              >
                OK
              </button>
            </div>
        </div>
      )}
    </div>
  );
}
