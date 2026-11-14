import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const load = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const picker = load("src/components/RedemptionAccountPicker.tsx");
const dialog = load("src/components/InvestmentRedemptionDialog.tsx");
const investments = load("src/routes/invest.tsx");

describe("Seletor de conta no resgate de investimentos", () => {
  it("usa os ícones salvos e a mesma identidade visual de Contas", () => {
    expect(investments).toContain('.from("bank_accounts").select("id,name,icon,color")');
    expect(investments).toContain("({ id, name, icon, color })");
    expect(picker).toContain('import { BankLogo } from "@/components/BankLogo"');
    expect(picker).toContain("icon={selected.icon}");
    expect(picker).toContain("color={selected.color}");
    expect(picker).toContain("icon={account.icon}");
    expect(picker).toContain("color={account.color}");
  });

  it("mantém contraste nos temas claro e escuro usando tokens globais", () => {
    for (const token of [
      "bg-background", "text-foreground", "border-input", "text-muted-foreground",
      "bg-popover", "text-popover-foreground", "bg-accent", "text-accent-foreground",
      "border-primary/40", "bg-primary/10", "focus-visible:ring-ring",
    ]) {
      expect(picker).toContain(token);
    }
    expect(picker).not.toContain("bg-white");
    expect(picker).not.toContain("bg-black");
    expect(picker).not.toContain("text-black");
    expect(picker).not.toContain("text-white");
  });

  it("mantém opções acessíveis no celular, destacando e fechando a conta selecionada", () => {
    expect(picker).toContain("min-h-12");
    expect(picker).toContain('aria-label="Selecione a conta de destino"');
    expect(picker).toContain("aria-pressed={active}");
    expect(picker).toContain("onChange(account.id)");
    expect(picker).toContain("setOpen(false)");
    expect(picker).toContain("max-h-[min(52dvh,380px)]");
    expect(picker).toContain("overflow-y-auto");
    expect(picker).toContain("z-[80]");
  });

  it("substitui o seletor nativo sem alterar as regras financeiras", () => {
    expect(dialog).toContain("<RedemptionAccountPicker");
    expect(dialog).toContain('onChange={(accountId) => setField("accountId", accountId)}');
    expect(dialog).not.toContain("<select");
    expect(dialog).toContain("validateRedemptionDraft(investment, draft)");
    expect(dialog).toContain("requestIdRef.current || crypto.randomUUID()");
    expect(dialog).toContain("ainda não registrei este resgate em Transações");
  });
});
