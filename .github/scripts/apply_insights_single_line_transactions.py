from pathlib import Path

chat_path = Path("src/components/FinancialChat.tsx")
chat = chat_path.read_text()

helper_anchor = '''const assistantListTone = (value: string) => {'''
helper = '''const assistantTransactionLine = (node: ReactNode) => {
  const text = assistantNodeText(node).replace(/\\s+/g, " ").trim();
  const match = text.match(/^(\\S+)\\s+(.+?)\\s+R\\$\\s*([0-9.]+,\\d{2})(?:\\s*[·•]?\\s*(\\d+\\/\\d+))?$/);
  if (!match) return null;

  return {
    icon: match[1],
    name: match[2].replace(/\\s*[—–-]\\s*$/, "").trim(),
    amount: `R$ ${match[3]}`,
    installment: match[4] || "",
  };
};

const assistantListTone = (value: string) => {'''

if "const assistantTransactionLine =" not in chat:
    if helper_anchor not in chat:
        raise SystemExit("assistantListTone anchor not found")
    chat = chat.replace(helper_anchor, helper, 1)

old_li = '''                    li: ({ children }) => (
                      <li className={cn(
                        "list-none rounded-xl border px-2.5 py-2 text-[13px] leading-5",
                        assistantListTone(assistantNodeText(children)),
                      )}>
                        {children}
                      </li>
                    ),'''

new_li = '''                    li: ({ children }) => {
                      const transaction = assistantTransactionLine(children);
                      return (
                        <li className={cn(
                          "list-none rounded-xl border",
                          transaction ? "px-2 py-1.5" : "px-2.5 py-2 text-[13px] leading-5",
                          assistantListTone(assistantNodeText(children)),
                        )}>
                          {transaction ? (
                            <div className="flex min-w-0 items-center gap-1 whitespace-nowrap text-[clamp(10.5px,2.8vw,13px)] leading-5 tracking-[-0.025em]">
                              <span className="shrink-0">{transaction.icon}</span>
                              <span className="min-w-0 flex-1 truncate font-semibold">{transaction.name}</span>
                              <span className="shrink-0 font-semibold tabular-nums">{transaction.amount}</span>
                              {transaction.installment && (
                                <span className="shrink-0 font-medium tabular-nums opacity-80">{transaction.installment}</span>
                              )}
                            </div>
                          ) : children}
                        </li>
                      );
                    },'''

if old_li in chat:
    chat = chat.replace(old_li, new_li, 1)
elif new_li not in chat:
    raise SystemExit("li renderer anchor not found")

chat_path.write_text(chat)

backend_path = Path("supabase/functions/financial-chat/index.ts")
backend = backend_path.read_text()

old_installment = '''          `- ${categoryEmoji(item.category)} **${compactOldInstallmentNames[index]} — R$ ${formatBRL(item.amount)}** · ${item.installmentNumber}/${item.totalInstallments}`,'''
new_installment = '''          `- ${categoryEmoji(item.category)} **${compactOldInstallmentNames[index]}** R$ ${formatBRL(item.amount)} ${item.installmentNumber}/${item.totalInstallments}`,'''
if old_installment in backend:
    backend = backend.replace(old_installment, new_installment, 1)
elif new_installment not in backend:
    raise SystemExit("old installment line anchor not found")

old_detail = '''      ? items.map((row, index) => `- ${categoryEmoji(rootCategory(row.category))} **${compactItemNames[index]} — R$ ${formatBRL(row.amount)}**`).join("\\n")'''
new_detail = '''      ? items.map((row, index) => `- ${categoryEmoji(rootCategory(row.category))} **${compactItemNames[index]}** R$ ${formatBRL(row.amount)}`).join("\\n")'''
if old_detail in backend:
    backend = backend.replace(old_detail, new_detail, 1)
elif new_detail not in backend:
    raise SystemExit("category detail line anchor not found")

backend_path.write_text(backend)

print("Applied single-line transaction layout")
