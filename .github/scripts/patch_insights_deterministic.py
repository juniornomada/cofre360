from pathlib import Path

p = Path("supabase/functions/financial-chat/index.ts")
s = p.read_text()

old_filter = '''  const visibleExpenses = rows.filter((tx) =>
    tx.is_visible !== false && tx.type === "expense" && !isTransferOrCardPayment(tx.category),
  );'''
new_filter = '''  const visibleExpenses = rows.filter((tx) =>
    tx.is_visible !== false &&
    tx.type === "expense" &&
    !isTransferOrCardPayment(tx.category) &&
    !isAdjustmentCategory(tx.category),
  );'''
if old_filter not in s:
    raise SystemExit("visibleExpenses filter marker not found")
s = s.replace(old_filter, new_filter, 1)

marker = "async function buildFinancialContext(supabase: any, question: string) {"
if marker not in s:
    raise SystemExit("buildFinancialContext marker not found")

helper = r'''const CATEGORY_EMOJI: Record<string, string> = {
  alimentacao: "🍴",
  compras: "🛍️",
  educacao: "🎓",
  impostos: "🧾",
  "impostos/taxas": "🧾",
  lazer: "🎮",
  moradia: "🏠",
  pets: "🐾",
  saude: "💊",
  transporte: "🚗",
};

function categoryEmoji(category: string) {
  return CATEGORY_EMOJI[norm(category)] || "📦";
}

function deterministicSseResponse(content: string, corsHeaders: Record<string, string>) {
  const payload = JSON.stringify({ choices: [{ delta: { content } }] });
  return new Response(`data: ${payload}\n\ndata: [DONE]\n\n`, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

async function buildDeterministicFinancialAnswer(
  supabase: any,
  messages: ChatMessage[],
): Promise<string | null> {
  const userMessages = messages.filter((message) => message.role === "user");
  const currentQuestion = userMessages[userMessages.length - 1]?.content || "";
  if (!currentQuestion.trim()) return null;

  const currentNormalized = norm(currentQuestion).replace(/[!?.,:;]+$/g, "").trim();
  const detailOnly = /^(detalhe|detalhar|detalha|mostre os detalhes|mostrar detalhes)$/.test(currentNormalized);
  const previousQuestion = userMessages.length > 1 ? userMessages[userMessages.length - 2]?.content || "" : "";
  const anchorQuestion = detailOnly && previousQuestion ? previousQuestion : currentQuestion;
  const q = norm(anchorQuestion);

  // Perguntas analíticas continuam com a IA. Este caminho é somente para números objetivos.
  if (!detailOnly && /(reduzir|economizar|dicas?|recomend|projec|compar|aument|diminu|por que|porque|como posso|analise|análise)/.test(q)) {
    return null;
  }

  const asksCategoryBreakdown = /(gastos? por categoria|em quais categorias|quais categorias|categorias? .*gastei|gastei .*categorias?)/.test(q);
  const asksObjectiveAmount = /(quanto .*gastei|quanto gastei|qual .*gasto|gasto total|gastos totais|total .*despesas?|despesas? .*mes|despesas? .*mês|despesas? em |despesas? de )/.test(q);
  if (!detailOnly && !asksCategoryBreakdown && !asksObjectiveAmount) return null;

  const { data, error } = await supabase
    .from("transactions")
    .select("id,name,category,date,purchase_date,amount,type,card,bank_account_id,installment_group_id,installment_number,total_installments,installment_source_amount,is_visible,created_at");
  if (error) throw error;

  const transactions = (data || []) as Transaction[];
  const expenses = collapseEconomicExpenses(transactions);
  const now = brNow();
  const requested = requestedMonth(anchorQuestion, now);
  const key = requested?.key || monthKey(new Date(now.getFullYear(), now.getMonth(), 1));
  const label = requested?.label || `${MONTHS_LABEL[now.getMonth()]}/${now.getFullYear()}`;
  const monthly = monthlyEconomicSummary(transactions, key);
  const categories = categoryTotals(expenses, key);
  const categoryTotal = roundMoney(categories.reduce((sum, [, value]) => sum + value, 0));

  const allCategoryNames = Array.from(new Set(expenses.map((row) => rootCategory(row.category))));
  const matchedCategory = allCategoryNames
    .sort((a, b) => b.length - a.length)
    .find((category) => {
      const needle = norm(category);
      return needle.length >= 3 && q.includes(needle);
    });

  if (matchedCategory && asksObjectiveAmount && !detailOnly) {
    const value = roundMoney(categories.find(([category]) => norm(category) === norm(matchedCategory))?.[1] || 0);
    return `### ${categoryEmoji(matchedCategory)} ${matchedCategory} — ${label}\n\n**Total comprado no período: R$ ${formatBRL(value)}**\n\n> 💡 Este valor usa a **data original da compra**. Parcelas de compras feitas em meses anteriores podem estar nas DESPESAS de ${label}, mas não entram novamente como novo gasto em ${matchedCategory}.`;
  }

  const categoryLines = categories.length
    ? categories.slice(0, 12).map(([category, amount]) => `${categoryEmoji(category)} **${category} — R$ ${formatBRL(amount)}**`).join("\n")
    : "(sem compras no período)";

  if (asksCategoryBreakdown && !detailOnly) {
    return `### 📊 Gastos por categoria — ${label}\n\n**Compras realizadas no período: R$ ${formatBRL(categoryTotal)}**\n\n${categoryLines}\n\n> 💡 Esta visão usa a **data da compra e o valor total econômico da compra**. Parcelas cobradas agora de compras antigas não são somadas novamente nas categorias.`;
  }

  if (detailOnly) {
    return `### 📊 Detalhamento — ${label}\n\n**💳 DESPESAS do mês: R$ ${formatBRL(monthly.expense)}**\n\nEsse é o valor do card **DESPESAS** e considera os lançamentos/parcelas que pertencem ao mês da cobrança.\n\n**🧾 Compras realizadas no mês por categoria: R$ ${formatBRL(categoryTotal)}**\n\n${categoryLines}\n\n> 💡 Os dois totais **não precisam ser iguais**: parcelas de compras de meses anteriores entram nas DESPESAS do mês, mas não são contabilizadas novamente como gasto da categoria.`;
  }

  if (asksObjectiveAmount) {
    return `### 💳 Despesas — ${label}\n\n**Total: R$ ${formatBRL(monthly.expense)}**\n\nEsse valor segue a mesma regra do card **DESPESAS** da Home/Transações: considera os lançamentos e parcelas do período, exclui transferências, pagamentos de cartão e ajustes de saldo, e abate reembolsos confirmados.`;
  }

  return null;
}

'''
s = s.replace(marker, helper + marker, 1)

old_call = '''    const question = [...messages].reverse().find((message) => message.role === "user")?.content || "";
    const context = await buildFinancialContext(supabase, question);'''
new_call = '''    const question = [...messages].reverse().find((message) => message.role === "user")?.content || "";
    const deterministicAnswer = await buildDeterministicFinancialAnswer(supabase, messages);
    if (deterministicAnswer) {
      return deterministicSseResponse(deterministicAnswer, corsHeaders);
    }
    const context = await buildFinancialContext(supabase, question);'''
if old_call not in s:
    raise SystemExit("serve question/context marker not found")
s = s.replace(old_call, new_call, 1)

p.write_text(s)
