from pathlib import Path

backend_path = Path("supabase/functions/financial-chat/index.ts")
backend = backend_path.read_text()

old_block = '''    const compactOldInstallmentNames = compactTransactionNames(oldInstallmentRows.map((item) => item.name));
    const detailLines = oldInstallmentRows.length
      ? oldInstallmentRows.map((item, index) =>
          `- ${categoryEmoji(item.category)} **${compactOldInstallmentNames[index]}** R$ ${formatBRL(item.amount)} ${item.installmentNumber}/${item.totalInstallments}`,
        ).join("\\n")
      : "(nenhuma parcela de compra antiga cobrada no período)";
    return `### 💳 Detalhe das parcelas de compras antigas — ${label}\\n\\n**Total dessas parcelas: R$ ${formatBRL(oldInstallmentTotal)}**\\n\\n${detailLines}\\n\\n**Resumo por categoria**\\n${categorySummary}\\n\\n> 💡 Estes lançamentos são selecionados individualmente pela data da cobrança e pela data original da compra. **Não** são estimados pela diferença entre os dois totais mensais.`;'''

new_block = '''    const compactOldInstallmentNames = compactTransactionNames(oldInstallmentRows.map((item) => item.name));
    const groupedDetails = oldInstallmentCategories.length
      ? oldInstallmentCategories.map(([category, categoryAmount]) => {
          const itemLines = oldInstallmentRows
            .map((item, index) => ({ item, compactName: compactOldInstallmentNames[index] }))
            .filter(({ item }) => norm(item.category) === norm(category))
            .map(({ item, compactName }) =>
              `- ${item.installmentNumber}/${item.totalInstallments} **${compactName}** · **R$ ${formatBRL(item.amount)}**`,
            )
            .join("\\n");
          return `#### ${categoryEmoji(category)} ${category}: R$ ${formatBRL(categoryAmount)}\\n${itemLines}`;
        }).join("\\n\\n")
      : "(nenhuma parcela de compra antiga cobrada no período)";
    return `### 💳 Detalhe das parcelas de compras antigas — ${label}\\n\\n**Total dessas parcelas: R$ ${formatBRL(oldInstallmentTotal)}**\\n\\n${groupedDetails}\\n\\n> 💡 Estes lançamentos são selecionados individualmente pela data da cobrança e pela data original da compra. **Não** são estimados pela diferença entre os dois totais mensais.`;'''

if old_block not in backend:
    raise SystemExit("grouped installment backend anchor not found")
backend = backend.replace(old_block, new_block, 1)
backend_path.write_text(backend)

chat_path = Path("src/components/FinancialChat.tsx")
chat = chat_path.read_text()

old_helper = '''const assistantTransactionLine = (node: ReactNode) => {
  const text = assistantNodeText(node).replace(/\\s+/g, " ").trim();
  const match = text.match(/^(\\S+)\\s+(.+?)\\s+R\\$\\s*([0-9.]+,\\d{2})(?:\\s*[·•]?\\s*(\\d+\\/\\d+))?$/);
  if (!match) return null;

  return {
    icon: match[1],
    name: match[2].replace(/\\s*[—–-]\\s*$/, "").trim(),
    amount: `R$ ${match[3]}`,
    installment: match[4] || "",
  };
};'''

new_helper = '''const assistantTransactionLine = (node: ReactNode) => {
  const text = assistantNodeText(node).replace(/\\s+/g, " ").trim();

  const installmentFirst = text.match(/^(\\d+\\/\\d+)\\s+(.+?)\\s*[·•]?\\s+R\\$\\s*([0-9.]+,\\d{2})$/);
  if (installmentFirst) {
    return {
      icon: "",
      name: installmentFirst[2].replace(/\\s*[—–-]\\s*$/, "").trim(),
      amount: `R$ ${installmentFirst[3]}`,
      installment: installmentFirst[1],
      installmentFirst: true,
    };
  }

  const match = text.match(/^(\\S+)\\s+(.+?)\\s+R\\$\\s*([0-9.]+,\\d{2})(?:\\s*[·•]?\\s*(\\d+\\/\\d+))?$/);
  if (!match) return null;

  return {
    icon: match[1],
    name: match[2].replace(/\\s*[—–-]\\s*$/, "").trim(),
    amount: `R$ ${match[3]}`,
    installment: match[4] || "",
    installmentFirst: false,
  };
};'''

if old_helper not in chat:
    raise SystemExit("transaction helper anchor not found")
chat = chat.replace(old_helper, new_helper, 1)

old_h3 = '''                    h3: ({ children }) => <h3 className="mb-1.5 mt-3 text-sm font-semibold text-emerald-400 first:mt-0">{children}</h3>,'''
new_h3 = '''                    h3: ({ children }) => <h3 className="mb-1.5 mt-3 text-sm font-semibold text-emerald-400 first:mt-0">{children}</h3>,
                    h4: ({ children }) => (
                      <h4 className={cn(
                        "mb-1 mt-3 rounded-lg border px-2 py-1.5 text-[13px] font-bold first:mt-0",
                        assistantListTone(assistantNodeText(children)),
                      )}>
                        {children}
                      </h4>
                    ),'''
if old_h3 not in chat:
    raise SystemExit("h3 renderer anchor not found")
chat = chat.replace(old_h3, new_h3, 1)

old_li = '''                    li: ({ children }) => {
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

new_li = '''                    li: ({ children }) => {
                      const transaction = assistantTransactionLine(children);
                      return (
                        <li className={cn(
                          "list-none",
                          transaction?.installmentFirst
                            ? "px-1 py-1 text-[12px] leading-5"
                            : transaction
                              ? "rounded-xl border px-2 py-1.5"
                              : "rounded-xl border px-2.5 py-2 text-[13px] leading-5",
                          !transaction?.installmentFirst && assistantListTone(assistantNodeText(children)),
                        )}>
                          {transaction ? (
                            <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[clamp(10.5px,2.8vw,13px)] leading-5 tracking-[-0.025em]">
                              {transaction.installmentFirst ? (
                                <>
                                  <span className="shrink-0 rounded-md border border-border/60 bg-background/65 px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-muted-foreground">
                                    {transaction.installment}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate font-medium">{transaction.name}</span>
                                  <span className="shrink-0 font-semibold tabular-nums">{transaction.amount}</span>
                                </>
                              ) : (
                                <>
                                  <span className="shrink-0">{transaction.icon}</span>
                                  <span className="min-w-0 flex-1 truncate font-semibold">{transaction.name}</span>
                                  <span className="shrink-0 font-semibold tabular-nums">{transaction.amount}</span>
                                  {transaction.installment && (
                                    <span className="shrink-0 font-medium tabular-nums opacity-80">{transaction.installment}</span>
                                  )}
                                </>
                              )}
                            </div>
                          ) : children}
                        </li>
                      );
                    },'''

if old_li not in chat:
    raise SystemExit("li renderer anchor not found")
chat = chat.replace(old_li, new_li, 1)
chat_path.write_text(chat)

print("Applied grouped old-installment layout")
