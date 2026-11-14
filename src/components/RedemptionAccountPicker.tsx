import { useState } from "react";
import { Check, ChevronDown, Landmark } from "lucide-react";
import { BankLogo } from "@/components/BankLogo";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type RedemptionAccount = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
};

export function RedemptionAccountPicker({
  accounts,
  value,
  disabled = false,
  loading = false,
  onChange,
}: {
  accounts: RedemptionAccount[];
  value: string;
  disabled?: boolean;
  loading?: boolean;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = accounts.find((account) => account.id === value);
  const unavailable = disabled || loading || accounts.length === 0;

  return (
    <div className="space-y-1">
      <p id="redemption-account-label" className="text-xs font-semibold text-foreground">
        Conta que recebeu o dinheiro
      </p>
      <Popover open={open && !unavailable} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={unavailable}
            aria-labelledby="redemption-account-label"
            aria-expanded={open && !unavailable}
            aria-haspopup="dialog"
            data-testid="redemption-account-trigger"
            className="flex min-h-12 w-full min-w-0 items-center gap-3 rounded-xl border border-input bg-background px-3 py-2 text-left text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {selected ? (
              <BankLogo icon={selected.icon} color={selected.color} name={selected.name} size="sm" />
            ) : (
              <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Landmark className="h-4 w-4" />
              </span>
            )}
            <span className={`min-w-0 flex-1 truncate text-sm font-medium ${selected ? "text-foreground" : "text-muted-foreground"}`}>
              {selected?.name ?? (loading ? "Carregando contas..." : accounts.length ? "Selecionar conta de destino" : "Nenhuma conta cadastrada")}
            </span>
            <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          collisionPadding={12}
          className="z-[80] w-[var(--radix-popover-trigger-width)] max-h-[min(52dvh,380px)] overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl"
        >
          <div role="group" aria-label="Selecione a conta de destino" className="space-y-1">
            {accounts.map((account) => {
              const active = account.id === value;
              return (
                <button
                  key={account.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    onChange(account.id);
                    setOpen(false);
                  }}
                  className={`flex min-h-12 w-full min-w-0 items-center gap-3 rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-transparent bg-transparent text-popover-foreground hover:bg-accent hover:text-accent-foreground"}`}
                >
                  <BankLogo icon={account.icon} color={account.color} name={account.name} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{account.name}</span>
                  {active && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
