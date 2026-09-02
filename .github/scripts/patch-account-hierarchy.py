from pathlib import Path

p = Path("src/components/QuickAddTransactionDialog.tsx")
text = p.read_text()

old = 'interface BankAccountOption { id: string; name: string; icon: string | null; color: string | null; balance: number }'
new = 'interface BankAccountOption { id: string; name: string; icon: string | null; color: string | null; balance: number; parent_account_id: string | null; parent_name: string | null }'
if old not in text:
    raise SystemExit("BankAccountOption target not found")
text = text.replace(old, new, 1)

old = 'supabase.from("bank_accounts").select("id, name, icon, color, balance").order("created_at", { ascending: true }),' 
new = 'supabase.from("bank_accounts").select("id, name, icon, color, balance, parent_account_id").order("created_at", { ascending: true }),' 
if old not in text:
    raise SystemExit("bank_accounts select target not found")
text = text.replace(old, new, 1)

old = '''      setBankAccounts((accs || []).map(a => ({
        id: a.id,
        name: a.name,
        icon: a.icon,
        color: a.color,
        balance: (a.balance || 0) + (incomeByAccount[a.id] || 0) - (expenseByAccount[a.id] || 0)
      })));'''
new = '''      setBankAccounts((accs || []).map(a => ({
        id: a.id,
        name: a.name,
        icon: a.icon,
        color: a.color,
        balance: (a.balance || 0) + (incomeByAccount[a.id] || 0) - (expenseByAccount[a.id] || 0),
        parent_account_id: a.parent_account_id || null,
        parent_name: a.parent_account_id
          ? (accs || []).find(parent => parent.id === a.parent_account_id)?.name || null
          : null,
      })));'''
if old not in text:
    raise SystemExit("setBankAccounts target not found")
text = text.replace(old, new, 1)

marker = '''  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>'''
helper = '''  const orderedBankAccounts = (() => {
    const roots = bankAccounts.filter(account => !account.parent_account_id);
    const grouped = roots.flatMap(parent => [
      parent,
      ...bankAccounts.filter(account => account.parent_account_id === parent.id),
    ]);
    const orphans = bankAccounts.filter(
      account =>
        !!account.parent_account_id &&
        !bankAccounts.some(parent => parent.id === account.parent_account_id),
    );
    return [...grouped, ...orphans];
  })();

  const accountHierarchyLabel = (account: BankAccountOption) =>
    account.parent_account_id
      ? `Subconta de ${account.parent_name || "conta principal"}`
      : "Conta principal";

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>'''
if marker not in text:
    raise SystemExit("component return marker not found")
text = text.replace(marker, helper, 1)

count_maps = text.count('{bankAccounts.map(a => (')
if count_maps < 2:
    raise SystemExit(f"expected >=2 bank maps, found {count_maps}")
text = text.replace('{bankAccounts.map(a => (', '{orderedBankAccounts.map(a => (')

old = '{bankAccounts.filter(a => a.id !== transferFromId).map(a => ('
new = '{orderedBankAccounts.filter(a => a.id !== transferFromId).map(a => ('
if old not in text:
    raise SystemExit("transfer destination map not found")
text = text.replace(old, new, 1)

old_inner = '''                        <BankLogo icon={a.icon} color={a.color} name={a.name} size="sm" />
                        <span className="text-[9px] text-foreground truncate w-full text-center leading-tight">{a.name}</span>'''
new_inner = '''                        <div className="relative">
                          <BankLogo icon={a.icon} color={a.color} name={a.name} size="sm" />
                          {a.parent_account_id && (
                            <span
                              aria-hidden="true"
                              className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-border bg-background px-0.5 text-[8px] font-black leading-none text-primary"
                            >
                              ↳
                            </span>
                          )}
                        </div>
                        <span className="text-[9px] font-medium text-foreground truncate w-full text-center leading-tight">{a.name}</span>
                        <span
                          className={cn(
                            "w-full truncate text-center text-[7px] leading-tight",
                            a.parent_account_id ? "font-semibold text-primary" : "text-muted-foreground",
                          )}
                          title={accountHierarchyLabel(a)}
                        >
                          {a.parent_account_id
                            ? `Sub · ${a.parent_name || "Principal"}`
                            : "Conta principal"}
                        </span>'''
count_inner = text.count(old_inner)
if count_inner < 3:
    raise SystemExit(f"expected >=3 account tile contents, found {count_inner}")
text = text.replace(old_inner, new_inner)

p.write_text(text)
print("patched", count_maps, count_inner)
