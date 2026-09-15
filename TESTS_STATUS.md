# Estado de Testes e Consistência — Cofre360

Atualizado em **15/09/2026**.

## Objetivo

O foco atual de qualidade é impedir regressões em regras financeiras que precisam produzir o mesmo resultado em Home, Transações, Cartões, Orçamentos e Insights IA.

## Suítes principais

| Área | Cobertura | Comando / mecanismo | Estado |
|---|---|---|---|
| Motor financeiro | Transferências, pagamentos de cartão e ajustes não entram no gasto econômico | `test:financial-invariants` | ✅ Pass |
| Reembolsos | Reembolso confirmado reduz DESPESAS e não vira receita | `test:financial-invariants` | ✅ Pass |
| Ciclo de cartão | Compra no dia de fechamento vai para a próxima fatura | `test:financial-invariants` + `test:fuzz-cycle` | ✅ Pass |
| Parcelamentos | Compra econômica entra uma vez, no mês original, pelo valor econômico integral | `test:financial-invariants` | ✅ Pass |
| Consistência cartões | Soma dos cartões = componente de cartões em DESPESAS | `test:financial-invariants` | ✅ Pass |
| Datas/ciclos | Parsing legado, virada de ano, datas inválidas, tolerância de ciclo | `test:fuzz-cycle` | ✅ Cobertura existente |
| Edição/importação | Paridade preview/salvamento e schema drift | `test:preview-parity` / `test:schema-drift` | ✅ Cobertura existente |
| Navegação/rótulos | Pagamentos, faturas, adição e navegação | `test:label-navigation` | ✅ Cobertura existente |
| Segurança de arquivos | Bloqueia `.env` e exports financeiros versionados | `check:no-sensitive-files` + CI | ✅ Ativo |
| Acessibilidade | Playwright/Axe, foco, contraste e ARIA | E2E existentes | ✅ Cobertura existente |

## Motor financeiro canônico

A produção agora mantém campos canônicos em `transactions` (`transaction_date`, `transaction_kind`, `card_id`) e disponibiliza a RPC autenticada `financial_month_facts(month)`. A Home e o Insights IA preferem essa mesma fonte de fatos mensais; cálculos locais permanecem apenas como fallback de disponibilidade.

A visão **DESPESAS** usa ciclo de fatura para cartão e mês-calendário para movimentos de conta. A visão **Gastos por categoria** usa a data original da compra e consolida parcelamentos pelo valor econômico integral da compra.

## Execução da auditoria de 15/09/2026

A suíte nova de invariantes financeiros executou **5/5 testes com sucesso** durante a aplicação das melhorias. Ela passa a ser o gate específico para as regras que anteriormente podiam divergir entre telas.

## Diagnósticos conhecidos

O `tsc --noEmit` global ainda registra dois diagnósticos legados em arquivos de teste que não foram introduzidos por esta auditoria:

- `src/tests/cards-invoice-sort-guard.test.ts`: inferência `never` em uso de `includes`.
- `src/tests/invoice-payment-status.test.ts`: tipagem de `bun:test` ausente no ambiente atual.

Esses dois diagnósticos devem ser tratados separadamente; não foram ocultados do relatório. O workflow de auditoria mantém o typecheck como diagnóstico não bloqueante enquanto os invariantes financeiros continuam bloqueantes.

## Regra de qualidade daqui em diante

Mudanças financeiras devem preservar simultaneamente: card DESPESAS = drilldown correspondente; categoria = filtro da categoria = fatos usados pelo Insights; soma dos cartões = componente dos cartões em DESPESAS; reembolso com o mesmo tratamento em todas as telas; e Orçamentos consumindo a mesma regra econômica de categorias.
