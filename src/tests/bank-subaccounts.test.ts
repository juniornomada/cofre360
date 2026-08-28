import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("bank subaccounts", () => {
  const accountsSource = fs.readFileSync(path.resolve(process.cwd(), "src/routes/accounts.tsx"), "utf8");
  const typesSource = fs.readFileSync(path.resolve(process.cwd(), "src/integrations/supabase/types.ts"), "utf8");

  it("stores a parent account when creating a subaccount", () => {
    expect(accountsSource).toContain("parent_account_id: formParentAccountId");
    expect(accountsSource).toContain("Adicionar subconta");
    expect(accountsSource).toContain("Subconta de {account.name}");
  });

  it("groups child accounts below their parent", () => {
    expect(accountsSource).toContain("child.parent_account_id === root.id");
    expect(accountsSource).toContain("account.parent_account_id && \"ml-5 sm:ml-8");
  });

  it("keeps generated Supabase types aware of parent_account_id", () => {
    expect(typesSource).toContain("parent_account_id: string | null");
    expect(typesSource).toContain("bank_accounts_parent_account_id_fkey");
  });
});
