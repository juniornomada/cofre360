from pathlib import Path

path = Path("src/components/FinancialChat.tsx")
text = path.read_text()

anchor = '''const assistantTransactionLine = (node: ReactNode) => {'''
helper = r'''const formatAssistantContent = (content: string) => {
  if (!content.includes("Detalhe das parcelas de compras antigas") || content.includes("#### ")) return content;

  const lines = content.split("\n");
  const transactionPattern = /^- (\S+) \*\*(.+?)\*\* R\$ ([0-9.]+,\d{2}) (\d+\/\d+)$/;
  const summaryPattern = /^- (\S+) \*\*(.+?) — R\$ ([0-9.]+,\d{2})\*\*$/;
  const summaryTitleIndex = lines.findIndex((line) => line.trim() === "**Resumo por categoria**");
  if (summaryTitleIndex < 0) return content;

  const transactions = lines
    .slice(0, summaryTitleIndex)
    .map((line) => line.match(transactionPattern))
    .filter((match): match is RegExpMatchArray => !!match)
    .map((match) => ({ icon: match[1], name: match[2], amount: match[3], installment: match[4] }));

  const footerIndex = lines.findIndex((line, index) => index > summaryTitleIndex && line.startsWith("> 💡"));
  const summaryEnd = footerIndex >= 0 ? footerIndex : lines.length;
  const summaries = lines
    .slice(summaryTitleIndex + 1, summaryEnd)
    .map((line) => line.match(summaryPattern))
    .filter((match): match is RegExpMatchArray => !!match)
    .map((match) => ({ icon: match[1], category: match[2], amount: match[3] }));

  if (!transactions.length || !summaries.length) return content;

  const firstTransactionIndex = lines.findIndex((line) => transactionPattern.test(line));
  if (firstTransactionIndex < 0) return content;

  const prefix = lines.slice(0, firstTransactionIndex);
  while (prefix.length && prefix[prefix.length - 1].trim() === "") prefix.pop();

  const grouped = summaries.flatMap((summary, index) => {
    const rows = transactions.filter((transaction) => transaction.icon === summary.icon);
    if (!rows.length) return [];
    const block = [
      `#### ${summary.icon} ${summary.category}: R$ ${summary.amount}`,
      ...rows.map((row) => `- ${row.installment} **${row.name}** · **R$ ${row.amount}**`),
    ];
    if (index < summaries.length - 1) block.push("");
    return block;
  });

  const footer = footerIndex >= 0 ? lines.slice(footerIndex) : [];
  return [...prefix, "", ...grouped, ...(footer.length ? ["", ...footer] : [])].join("\n");
};

const assistantTransactionLine = (node: ReactNode) => {'''

if "const formatAssistantContent =" not in text:
    if anchor not in text:
        raise SystemExit("assistant transaction helper anchor not found")
    text = text.replace(anchor, helper, 1)

old_render = '''                  {msg.content || "..."}'''
new_render = '''                  {formatAssistantContent(msg.content) || "..."}'''
if old_render in text:
    text = text.replace(old_render, new_render, 1)
elif new_render not in text:
    raise SystemExit("message render anchor not found")

path.write_text(text)
print("Applied client-side old-installment grouping fallback")
