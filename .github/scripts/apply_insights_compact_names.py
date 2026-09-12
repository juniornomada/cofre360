from pathlib import Path

path = Path('supabase/functions/financial-chat/index.ts')
text = path.read_text()

anchor = '''function formatBRL(value: number) {
'''
helper = '''function compactTransactionName(value: string, maxWords = 5) {
  const cleaned = String(value || "")
    .replace(/(?:\\s+[-–—·]?\\s*)?(?:MELI|MERCADO\\s+LIVRE)\\s*$/i, "")
    .replace(/\\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter(Boolean);
  return words.slice(0, maxWords).join(" ") || String(value || "").trim();
}

function compactTransactionNames(values: string[], maxWords = 5) {
  const cleaned = values.map((value) => String(value || "")
    .replace(/(?:\\s+[-–—·]?\\s*)?(?:MELI|MERCADO\\s+LIVRE)\\s*$/i, "")
    .replace(/\\s+/g, " ")
    .trim());

  return cleaned.map((value, index) => {
    const words = value.split(" ").filter(Boolean);
    let size = Math.min(maxWords, words.length);
    let candidate = words.slice(0, size).join(" ");

    while (size < words.length) {
      const collision = cleaned.some((other, otherIndex) => {
        if (otherIndex === index || other === value) return false;
        const otherWords = other.split(" ").filter(Boolean);
        return otherWords.slice(0, size).join(" ").toLocaleLowerCase("pt-BR") === candidate.toLocaleLowerCase("pt-BR");
      });
      if (!collision) break;
      size += 1;
      candidate = words.slice(0, size).join(" ");
    }

    return candidate || compactTransactionName(values[index], maxWords);
  });
}

'''
if helper not in text:
    if anchor not in text:
        raise SystemExit('formatBRL anchor not found')
    text = text.replace(anchor, helper + anchor, 1)

old = '''    const detailLines = oldInstallmentRows.length
      ? oldInstallmentRows.map((item) => {
          const purchase = item.purchaseDate.toLocaleDateString("pt-BR");
          return `- ${categoryEmoji(item.category)} **${item.name} — R$ ${formatBRL(item.amount)}** · ${item.installmentNumber}/${item.totalInstallments} · ${item.category} · ${item.card} · compra ${purchase}`;
        }).join("\\n")
      : "(nenhuma parcela de compra antiga cobrada no período)";'''
new = '''    const compactOldInstallmentNames = compactTransactionNames(oldInstallmentRows.map((item) => item.name));
    const detailLines = oldInstallmentRows.length
      ? oldInstallmentRows.map((item, index) =>
          `- ${categoryEmoji(item.category)} **${compactOldInstallmentNames[index]} — R$ ${formatBRL(item.amount)}** · ${item.installmentNumber}/${item.totalInstallments}`,
        ).join("\\n")
      : "(nenhuma parcela de compra antiga cobrada no período)";'''
if old not in text:
    raise SystemExit('old installment detail block not found')
text = text.replace(old, new, 1)

old2 = '''    const total = roundMoney(items.reduce((sum, row) => sum + row.amount, 0));
    const lines = items.length
      ? items.map((row) => `- ${categoryEmoji(rootCategory(row.category))} **${row.name} — R$ ${formatBRL(row.amount)}** · ${row.category}`).join("\\n")
      : "(nenhuma compra encontrada com esses critérios)";'''
new2 = '''    const total = roundMoney(items.reduce((sum, row) => sum + row.amount, 0));
    const compactItemNames = compactTransactionNames(items.map((row) => row.name));
    const lines = items.length
      ? items.map((row, index) => `- ${categoryEmoji(rootCategory(row.category))} **${compactItemNames[index]} — R$ ${formatBRL(row.amount)}**`).join("\\n")
      : "(nenhuma compra encontrada com esses critérios)";'''
if old2 not in text:
    raise SystemExit('category item detail block not found')
text = text.replace(old2, new2, 1)

path.write_text(text)
