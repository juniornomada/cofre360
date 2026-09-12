from pathlib import Path

chat = Path("src/components/FinancialChat.tsx")
text = chat.read_text()
text = text.replace(
    'import { Children, isValidElement, useState, useRef, useEffect, type ReactNode } from "react";',
    'import { isValidElement, useState, useRef, useEffect, type ReactNode } from "react";',
    1,
)
text = text.replace("const MAX_VISIBLE_ASSISTANT_ITEMS = 5;\n", "", 1)

start = text.index("function CompactAssistantList(")
end = text.index("\n}\n\nexport function FinancialChat", start) + 3
replacement = '''function CompactAssistantList({ children, ordered = false }: { children?: ReactNode; ordered?: boolean }) {
  const ListTag = ordered ? "ol" : "ul";

  return (
    <div className="my-2.5">
      <ListTag className="space-y-1.5">{children}</ListTag>
    </div>
  );
}
'''
text = text[:start] + replacement + text[end:]
chat.write_text(text)

backend = Path("supabase/functions/financial-chat/index.ts")
code = backend.read_text()
code = code.replace(
    "oldInstallmentRows.slice(0, 25).map((item) => {",
    "oldInstallmentRows.map((item) => {",
    1,
)
code = code.replace(
    'return `- **${item.name} — R$ ${formatBRL(item.amount)}** · ${item.installmentNumber}/${item.totalInstallments} · ${item.category} · ${item.card} · compra ${purchase}`;',
    'return `- ${categoryEmoji(item.category)} **${item.name} — R$ ${formatBRL(item.amount)}** · ${item.installmentNumber}/${item.totalInstallments} · ${item.category} · ${item.card} · compra ${purchase}`;',
    1,
)
code = code.replace(
    'items.slice(0, 30).map((row) => `- **${row.name} — R$ ${formatBRL(row.amount)}** · ${row.category}`).join("\\n")',
    'items.map((row) => `- ${categoryEmoji(rootCategory(row.category))} **${row.name} — R$ ${formatBRL(row.amount)}** · ${row.category}`).join("\\n")',
    1,
)
backend.write_text(code)

assert "Ver todos (" not in text
assert "oldInstallmentRows.map" in code
assert "categoryEmoji(item.category)" in code
assert "items.map((row) => `- ${categoryEmoji(rootCategory(row.category))}" in code
