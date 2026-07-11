
# Módulo de Reconciliação Financeira

Entrega em 4 fases atômicas. Cada fase deixa o app funcional; se você quiser parar em qualquer ponto, dá pra pausar.

## Fase 1 — Motor de validação (fundação)

Biblioteca pura em `src/lib/reconciliation/` — sem UI, testável isoladamente.

- `types.ts` — `ReconciliationCheck`, `Divergence`, `RunResult`, tipos de regra (`equality | sum | zero`) e tolerância (`abs | pct`).
- `checkers/bank-accounts.ts` — para cada conta: `saldo esperado = opening_balance + Σ(income − expense − transfer_out + transfer_in)` (transações visíveis) vs `bank_accounts.balance` derivado. Reusa `get_bank_account_balances`.
- `checkers/cards.ts` — para cada cartão: `used derivado = Σ transações − Σ pagamentos` no período; valida que `cards.used = 0` (regra pós-reconciliação já aplicada) e reporta o derivado.
- `checkers/invoices.ts` — para cada ciclo em intervalo: `Σ transações do ciclo − Σ card_payments do ciclo`. Se `paid=true` mas saldo ≠ 0, diverge.
- `checkers/budget.ts` — por categoria/mês: `gasto real vs budget_categories.amount` com tolerância %.
- `engine.ts` — `runReconciliation({ userId, periodStart, periodEnd, ruleIds?, granularity })` orquestra checkers, aplica tolerâncias, retorna `RunResult`.
- Testes cobrindo cada checker + engine com fixtures determinísticas.

## Fase 2 — Persistência + Server Functions

Migração:

```
reconciliation_rules
  id, user_id, name, check_type ('bank_account'|'card'|'invoice'|'budget'),
  rule_kind ('equality'|'sum'|'zero'), tolerance_kind ('abs'|'pct'),
  tolerance_value numeric, target_ids uuid[] (contas/cartões/categorias),
  enabled bool, created_at, updated_at

reconciliation_runs
  id, user_id, triggered_by ('manual'|'scheduled'), period_start, period_end,
  status ('running'|'completed'|'failed'), divergences_count int,
  total_divergence_amount numeric, payload jsonb (RunResult serializado),
  started_at, completed_at

reconciliation_divergences
  id, run_id, user_id, check_type, entity_id, entity_label,
  expected numeric, actual numeric, delta numeric,
  rule_id, investigated bool default false, investigated_at, note text
```

Todas com RLS `auth.uid() = user_id` + GRANT authenticated/service_role.

Server functions em `src/lib/reconciliation/*.functions.ts` (com `requireSupabaseAuth`):
- `listRules`, `upsertRule`, `deleteRule`
- `runReconciliation({ periodStart, periodEnd, ruleIds? })` — executa engine, persiste run + divergences
- `listRuns({ limit, offset })`, `getRun(id)`
- `markInvestigated(divergenceId, note?)`
- `exportRunCsv(runId)` — retorna CSV string

## Fase 3 — UI `/reconciliation`

Rota autenticada em `src/routes/_authenticated/reconciliation.tsx` (+ redirect público).

**Layout coluna única, 3 abas via `?tab=`:**

1. **Dashboard** (default) — cards de status da última run por check_type, gráfico de tendência (últimas 30 runs, barras de nº de divergências), lista das 10 divergências mais recentes não investigadas.
2. **Executar** — `DateRangePicker` shadcn com presets (Hoje/Ontem/Semana/Mês/Trimestre/Ano/Mês anterior/Ano anterior) + range custom, multi-select de regras, botão "Validar agora" com spinner. Ao terminar: tabela de divergências (filtrável por check_type, ordenável por delta), ações `Ver detalhes` / `Marcar investigada` / export CSV.
3. **Regras** — CRUD com formulário guiado (wizard 3 passos: escolher tipo de check → selecionar entidades alvo → definir tolerância). Validação Zod em tempo real.

Componentes reutilizáveis em `src/components/reconciliation/`.

**Notificação in-app:** badge com contador de divergências não investigadas no menu principal (`src/components/AppSidebar.tsx` ou equivalente) + `toast.warning` após run manual com divergências.

**A11y:** foco visível, `aria-label` em botões só-ícone, tabelas com `<caption>` sr-only, contraste AA nos badges de status.

## Fase 4 — Agendamento

Server route `POST /api/public/hooks/reconciliation-daily` que:
1. Valida `apikey` header contra anon key.
2. Para cada usuário com pelo menos uma regra `enabled`, roda reconciliação do dia anterior.
3. Persiste run com `triggered_by='scheduled'`.

Cron job via `supabase--insert`:
```sql
select cron.schedule(
  'reconciliation-daily',
  '0 3 * * *',  -- 03:00 UTC diário
  $$ select net.http_post(
       url:='https://project--8755cbe4-fc00-44b3-810a-824346dac2f8.lovable.app/api/public/hooks/reconciliation-daily',
       headers:='{"Content-Type":"application/json","apikey":"<anon>"}'::jsonb,
       body:='{}'::jsonb
     ); $$
);
```

Badge no menu reflete divergências acumuladas automaticamente (query polling ou realtime na tabela `reconciliation_divergences`).

## Testes

- Unitários por checker (fixtures determinísticas cobrindo fronteira de ciclo, transações ocultas, pagamentos parciais).
- Contrato das server functions (payload sanitizado, RLS bloqueando cross-user).
- Property-based para tolerâncias (`|delta| ≤ tolerance ⇒ sem divergência`).
- E2E Playwright: fluxo run manual → ver divergência → marcar investigada → export CSV.

## Fora de escopo (deliberadamente)

- Notificação por e-mail (você optou por só na tela).
- RBAC multi-papel (o app é single-tenant por usuário).
- Reconciliação retroativa em lote (o cron cobre incremental; retro fica manual via UI).

## Ordem de execução

1. Migração das 3 tabelas + RLS/GRANTs (approve first).
2. Fase 1 (lib pura + testes) — em paralelo já dá pra revisar.
3. Fase 2 (server fns) após aprovação da migração e regen dos types.
4. Fase 3 (UI + badge).
5. Fase 4 (cron) — última porque depende de tudo estável.

Aprova para eu começar pela migração?
