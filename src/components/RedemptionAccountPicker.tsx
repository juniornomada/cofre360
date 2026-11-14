import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, Landmark } from "lucide-react";
import { BankLogo } from "@/components/BankLogo";

export type RedemptionAccount = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
};

export function RedemptionAccountPicker({
  accounts,
  value,
  onChange,
  disabled,
  loading,
}: {
  accounts: RedemptionAccount[];
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
  loading: boolean;
}) {
  const selected = accounts.find((account) => account.id === value);

  return (
    <div className="space-y-1.5">
      <span id="redemption-account-label" className="block text-xs font-semibold text-foreground">
        Conta que recebeu o dinheiro
      </span>
      <SelectPrimitive.Root value={value} onValueChange={onChange} disabled={disabled || loading || accounts.length === 0}>
        <SelectPrimitive.Trigger
          aria-labelledby="redemption-account-label"
          aria-label="Conta que recebeu o dinheiro"
          data-testid="redemption-account-trigger"
          className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-border/80 bg-card px-3 text-left text-foreground shadow-sm outline-none transition-colors hover:border-primary/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/70">
            {selected
              ? <BankLogo icon={selected.icon} color={selected.color} name={selected.name} size="sm" />
              : <Landmark className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
          </span>
          <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${selected ? "text-foreground" : "text-muted-foreground"}`}>
            {selected?.name ?? (loading ? "Carregando contas..." : accounts.length ? "Selecione uma conta" : "Nenhuma conta disponível")}
          </span>
          <SelectPrimitive.Icon asChild>
            <ChevronDown className="h-5 w-5 shrink-0 text-foreground/70" aria-hidden="true" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            side="top"
            sideOffset={8}
            collisionPadding={12}
            className="z-[80] max-h-[min(58dvh,420px)] w-[var(--radix-select-trigger-width)] overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl shadow-black/50 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0"
            data-testid="redemption-account-options"
          >
            <SelectPrimitive.Viewport className="max-h-[min(55dvh,400px)] overflow-y-auto p-1.5">
              <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">
                Selecione a conta de destino
              </div>
              {accounts.map((account) => (
                <SelectPrimitive.Item
                  key={account.id}
                  value={account.id}
                  aria-label={account.name}
                  className="relative flex min-h-14 cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2 pr-10 text-foreground outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[state=checked]:bg-primary/15 data-[state=checked]:text-foreground data-[disabled]:opacity-50"
                >
                  <BankLogo icon={account.icon} color={account.color} name={account.name} size="sm" />
                  <SelectPrimitive.ItemText>
                    <span className="block truncate text-sm font-medium">{account.name}</span>
                  </SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="absolute right-3 text-primary">
                    <Check className="h-5 w-5" aria-hidden="true" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </div>
  );
}
