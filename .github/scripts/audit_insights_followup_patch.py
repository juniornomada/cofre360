from pathlib import Path

p = Path('supabase/functions/financial-chat/index.ts')
s = p.read_text()

def rep(old: str, new: str, label: str):
    global s
    if old not in s:
        raise SystemExit(f'{label} anchor not found')
    s = s.replace(old, new, 1)

# Old installments must truly originate before the charged month, not merely in a different month.
rep('''    if (!purchaseDate || monthKey(purchaseDate) === key) continue;
    details.push({''', '''    const chargeMonthStart = new Date(chargeDate.getFullYear(), chargeDate.getMonth(), 1);
    if (!purchaseDate || purchaseDate >= chargeMonthStart) continue;
    details.push({''', 'old installment chronology')

# Advice like "o que cortar" remains an advisory LLM request, while exact category item questions are deterministic.
rep('''  if (!detailOnly && /(reduzir|economizar|dicas?|recomend|projec|por que|porque|como posso|analise|análise)/.test(q)) return null;''', '''  if (!detailOnly && /(reduzir|economizar|cortar|dicas?|recomend|projec|por que|porque|como posso|analise|análise)/.test(q)) return null;''', 'advisory gate')

rep('''  const asksExpenseComposition = /(despesas?.*(nao entraram|não entraram|fora|diferenca|diferença|compoem|compõem).*(gastos?|categor)|o que.*nao entrou.*categor|o que.*não entrou.*categor)/.test(q);
  const asksEconomicVsExpenseConcept =''', '''  const asksExpenseComposition = /(despesas?.*(nao entraram|não entraram|fora|diferenca|diferença|compoem|compõem).*(gastos?|categor)|o que.*nao entrou.*categor|o que.*não entrou.*categor)/.test(q);
  const asksCategoryItemDetail = /(quais .*despesas|quais .*gastos|outras despesas|outros gastos|alem|além|tirando|exceto|detalh.*categoria)/.test(q);
  const asksEconomicVsExpenseConcept =''', 'category item intent')

rep('''  if (!detailOnly && !asksOldInstallmentCategories && !asksCategoryBreakdown && !asksSubcategoryBreakdown && !asksObjectiveAmount && !asksIncomeAmount && !asksFinancialSummary && !asksPurchaseComparison && !asksExpenseComposition && !asksEconomicVsExpenseConcept) return null;''', '''  if (!detailOnly && !asksOldInstallmentCategories && !asksCategoryBreakdown && !asksSubcategoryBreakdown && !asksObjectiveAmount && !asksIncomeAmount && !asksFinancialSummary && !asksPurchaseComparison && !asksExpenseComposition && !asksCategoryItemDetail && !asksEconomicVsExpenseConcept) return null;''', 'deterministic gate')

# Insert exact item-level answer after card source handling and before subcategory handling.
marker = '''  if (matchedCard && asksObjectiveAmount && !detailOnly) {
    const value = roundMoney(expenses.filter((row) => monthKey(row.date) === key && norm(row.card) === norm(matchedCard)).reduce((sum, row) => sum + row.amount, 0));
    return `### 💳 ${matchedCard} — ${label}\\n\\n**Compras realizadas no cartão: R$ ${formatBRL(value)}**\\n\\n> 💡 Este valor considera a data original e o valor econômico das compras vinculadas ao cartão, sem repetir as parcelas futuras.`;
  }
'''
if marker not in s:
    raise SystemExit('matched card marker not found')
branch = r'''
  if (matchedCategory && asksCategoryItemDetail && !detailOnly) {
    let items = expenses
      .filter((row) => monthKey(row.date) === key && norm(rootCategory(row.category)) === norm(matchedCategory))
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));

    const exclusionMatch = q.match(/(?:alem(?: do| da| de)?|tirando|exceto)\s+(.+)$/);
    const exclusionWords = (exclusionMatch?.[1] || "")
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4 && !["categoria", "mes", "este", "esse"].includes(word));
    if (exclusionWords.length) {
      items = items.filter((row) => {
        const haystack = `${norm(row.name)} ${norm(row.category)}`;
        return !exclusionWords.some((word) => haystack.includes(word));
      });
    }

    const total = roundMoney(items.reduce((sum, row) => sum + row.amount, 0));
    const lines = items.length
      ? items.slice(0, 30).map((row) => `- **${row.name} — R$ ${formatBRL(row.amount)}** · ${row.category}`).join("\n")
      : "(nenhuma compra encontrada com esses critérios)";
    const exclusionText = exclusionWords.length ? `, excluindo “${exclusionWords.join(" ")}”` : "";
    return `### ${categoryEmoji(matchedCategory)} Detalhe de ${matchedCategory} — ${label}\n\n**Total${exclusionText}: R$ ${formatBRL(total)}**\n\n${lines}\n\n> 💡 O detalhamento usa as compras econômicas reais do período, item por item, em vez de inferir o restante por diferença.`;
  }
'''
s = s.replace(marker, marker + branch, 1)

# Add item-level economic rows to LLM context for advisory/free-form questions.
marker = r'''  const previousDetailedCategoryLines = previousDetailedCategories.slice(0, 30)
    .map(([category, amount]) => `- ${category}: R$ ${formatBRL(amount)}`)
    .join("\n");'''
if marker not in s:
    raise SystemExit('detailed lines marker not found')
addition = r'''
  const currentEconomicItemLines = expenses
    .filter((row) => monthKey(row.date) === currentKey)
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
    .slice(0, 100)
    .map((row) => `- ${row.date.toLocaleDateString("pt-BR")} | ${row.name} | ${row.category} | R$ ${formatBRL(row.amount)}${row.card ? ` | ${row.card}` : ""}`)
    .join("\n");
  const previousEconomicItemLines = expenses
    .filter((row) => monthKey(row.date) === previousKey)
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
    .slice(0, 100)
    .map((row) => `- ${row.date.toLocaleDateString("pt-BR")} | ${row.name} | ${row.category} | R$ ${formatBRL(row.amount)}${row.card ? ` | ${row.card}` : ""}`)
    .join("\n");'''
s = s.replace(marker, marker + addition, 1)

rep('''#### Detalhe real por categoria/subcategoria — compras do mês atual
${currentDetailedCategoryLines || "(sem despesas)"}

### Mês anterior''', '''#### Detalhe real por categoria/subcategoria — compras do mês atual
${currentDetailedCategoryLines || "(sem despesas)"}

#### Compras econômicas reais do mês atual — item a item
${currentEconomicItemLines || "(sem compras)"}

### Mês anterior''', 'current item context')

rep('''#### Detalhe real por categoria/subcategoria — compras do mês anterior
${previousDetailedCategoryLines || "(sem despesas)"}

### Contas''', '''#### Detalhe real por categoria/subcategoria — compras do mês anterior
${previousDetailedCategoryLines || "(sem despesas)"}

#### Compras econômicas reais do mês anterior — item a item
${previousEconomicItemLines || "(sem compras)"}

### Contas''', 'previous item context')

prompt = '- Se o usuário pedir uma subcategoria ou uma composição de categoria, use o "Detalhe real por categoria/subcategoria" e garanta que a soma feche com o total da categoria.'
if prompt not in s:
    raise SystemExit('prompt detail anchor not found')
s = s.replace(prompt, prompt + '''
- Para perguntas como “quais outras despesas”, “além de”, “tirando” ou “exceto”, use as compras econômicas reais item a item e aplique a exclusão explicitamente. Não responda apenas com uma subtração de totais se os itens estiverem disponíveis.''', 1)

p.write_text(s)
print('Follow-up detail hardening applied')
