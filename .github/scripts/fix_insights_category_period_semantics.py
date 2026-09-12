from pathlib import Path

p = Path("supabase/functions/financial-chat/index.ts")
s = p.read_text()

replacements = {
    "#### Detalhamento das DESPESAS do período — fecha com o total acima":
        "#### Composição das DESPESAS do período pelo mês de cobrança/lançamento — pode incluir parcelas de compras antigas",
    "#### Gastos por categoria no mês da compra — visão de categorias, pode diferir do total mensal":
        "#### Gastos por categoria — compras realizadas no período (data da compra; parcelas futuras não repetem gasto)",
    "#### Detalhamento das DESPESAS do mês atual — fecha com o total acima":
        "#### Composição das DESPESAS do mês atual pelo mês de cobrança/lançamento — pode incluir parcelas de compras antigas",
    "#### Detalhamento das DESPESAS do mês anterior — fecha com o total acima":
        "#### Composição das DESPESAS do mês anterior pelo mês de cobrança/lançamento — pode incluir parcelas de compras antigas",
    '- Se o usuário pedir "detalhe", "em quais categorias" ou continuação equivalente depois do total mensal, use "Detalhamento das DESPESAS do mês/período" e garanta que os itens reconciliem com o total. Reembolsos aparecem como abatimento negativo.':
        '- Se o usuário perguntar "em quais categorias", "gastos por categoria", "quanto gastei com Transporte/Alimentação/etc." ou equivalente, use SEMPRE a seção "Gastos por categoria — compras realizadas no período". Essa visão usa a data original da compra e não repete parcelas nos meses seguintes.\n- NUNCA use a "Composição das DESPESAS pelo mês de cobrança/lançamento" como se fosse gasto novo por categoria. Ela serve apenas para explicar quais parcelas/lançamentos compõem o card mensal de DESPESAS e pode incluir compras de meses anteriores.\n- Se o usuário perguntar quais parcelas/lançamentos compõem o total de DESPESAS, use a composição mensal e deixe explícito que parcelas de compras antigas continuam sendo despesas do mês da cobrança, mas não novos gastos da categoria.\n- Se o usuário responder apenas "detalhe" depois de perguntar o gasto/despesa total do mês, apresente as duas visões separadamente e com rótulos claros: (1) DESPESAS do mês pela cobrança/lançamento; (2) GASTOS POR CATEGORIA das compras realizadas no mês. Não force os dois totais a serem iguais.',
    '- Gastos parcelados de cartão são consolidados economicamente no mês da compra nas seções de categoria; não some parcelas futuras de novo como novo gasto da categoria.':
        '- Gastos parcelados de cartão são consolidados economicamente no mês da compra nas seções de categoria; o valor integral da compra entra uma única vez no mês da compra. As parcelas futuras entram em DESPESAS do respectivo mês/fatura, mas NÃO entram novamente como gasto de Transporte, Alimentação, Compras ou qualquer outra categoria.'
}

for old, new in replacements.items():
    if old not in s:
        raise SystemExit(f"expected text not found: {old[:90]}")
    s = s.replace(old, new)

# Reforço explícito logo após a regra que separa os dois totais.
needle = '- NÃO use o "Total por categorias no mês da compra" como resposta para "gasto total/despesas do mês". Essa visão existe para análise econômica por categoria e pode diferir do card mensal por compras parceladas e data original da compra.\n'
extra = '- Os totais de DESPESAS do mês e GASTOS POR CATEGORIA têm propósitos diferentes e NÃO precisam fechar entre si. DESPESAS segue a data de cobrança/lançamento; categorias seguem a data original da compra.\n'
if extra not in s:
    if needle not in s:
        raise SystemExit("monthly/category distinction marker not found")
    s = s.replace(needle, needle + extra, 1)

p.write_text(s)
