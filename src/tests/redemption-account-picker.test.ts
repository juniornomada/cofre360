import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const picker = read("src/components/RedemptionAccountPicker.tsx");
const dialog = read("src/components/InvestmentRedemptionDialog.tsx");
const route = read("src/routes/invest.tsx");
const logos = read("src/components/BankLogo.tsx");
const styles = read("src/styles.css");

describe("Resgate — seletor de conta com ícones e suporte a temas", () => {
  it("exibe nome, ícone e cor reais de cada conta, inclusive em opções selecionadas", () => {
    expect(picker).toContain("import { BankLogo }");
    expect(picker).toContain("icon: string | null");
    expect(picker).toContain("color: string | null");
    expect(picker).toContain("<BankLogo icon={selected.icon} color={selected.color} name={selected.name}");
    expect(picker).toContain("<BankLogo icon={account.icon} color={account.color} name={account.name}");
    expect(route).toContain('.from("bank_accounts").select("id,name,icon,color,is_visible")');
    expect(route).toContain(".filter((account) => account.is_visible !== false)");
    expect(route).toContain("({ id, name, icon, color })");
    expect(logos).toContain('id: "mercadopago"');
  });

  it("respeita cores adaptativas dos temas claro e escuro, inclusive no menu em portal", () => {
    expect(picker).toContain("bg-card");
    expect(picker).toContain("text-foreground");
    expect(picker).toContain("border-border");
    expect(picker).toContain("bg-popover text-popover-foreground");
    expect(picker).toContain("focus-visible:ring-primary/50");
    expect(picker).toContain("focus:bg-accent focus:text-accent-foreground");
    expect(picker).toContain("data-[state=checked]:bg-primary/15");
    expect(styles).toContain("--color-popover: var(--popover)");
    expect(styles).toContain("--popover-foreground:");
    expect(styles).toContain(":root,");
    expect(styles).toContain(".dark {");
    expect(styles).toContain(".light {");
    expect(picker).not.toContain("bg-white text-black");
    expect(picker).not.toContain("bg-black text-white");
  });

  it("permite abrir e selecionar por toque ou teclado, sem select nativo branco", () => {
    expect(picker).toContain("<SelectPrimitive.Root value={value} onValueChange={onChange}");
    expect(picker).toContain("<SelectPrimitive.Trigger");
    expect(picker).toContain("<SelectPrimitive.Portal>");
    expect(picker).toContain("<SelectPrimitive.Item");
    expect(picker).toContain("<SelectPrimitive.ItemText>");
    expect(picker).toContain("min-h-14");
    expect(picker).toContain("max-h-[min(55dvh,400px)]");
    expect(picker).toContain("aria-labelledby=");
    expect(picker).toContain("aria-label={account.name}");
    expect(dialog).toContain("<RedemptionAccountPicker");
    expect(dialog).toContain('onChange={(id) => setField("accountId", id)}');
    expect(dialog).not.toContain("<select value={draft.accountId}");
  });

  it("mantém o último destino usado e não modifica valores nem operações de resgate", () => {
    expect(dialog).toContain('localStorage.getItem(LAST_ACCOUNT_KEY)');
    expect(dialog).toContain('localStorage.setItem(LAST_ACCOUNT_KEY, result.value.accountId)');
    expect(dialog).toContain("validateRedemptionDraft(investment, draft)");
    expect(dialog).toContain("onConfirm(result.value, requestId)");
    expect(dialog).toContain("Conferi o líquido do extrato");
    expect(route).toContain('supabase.rpc("redeem_investment"');
  });
});
