# Cofre 360 — Revisão Detalhada da Aplicação

Documento vivo que reflete o estado atual da aplicação (build mode, 2026‑07). Inspirado no template de "Construção e Revisão Detalhada de Aplicação Web Completa".

---

## 1. Visão Geral Estratégica

- **Nome da Aplicação:** Cofre 360 (interno: *My Money Labs*, inspirado no Pierre Finance).
- **Propósito Principal:** Gestão financeira pessoal ponta a ponta — contas, cartões, orçamento, metas, reconciliação e insights via IA — otimizada para mobile.
- **Público-Alvo:** Usuário final pessoa física gerenciando finanças pessoais/familiares no Brasil (BRL, categorias e datas em pt‑BR).
- **Metas de Negócio:**
  - Reduzir esforço manual de conciliação de cartões e contas.
  - Aumentar previsibilidade de fluxo de caixa com faturas futuras e parcelas.
  - Engajamento diário via chat IA e insights automáticos.
- **Diferenciais:**
  - Ciclo de fatura por cartão com virada de ano tratada por heurística (`parseTxDate`).
  - Motor de reconciliação diária com relatório de consistência.
  - Importação de fatura (PDF) e extrato (CSV) com auto‑categorização.
  - Chat financeiro (Lovable AI Gateway) integrado ao dado do usuário.

---

## 2. Design System e Diretrizes de UI/UX

### Branding e Identidade Visual

- **Tema padrão:** escuro (Cofre 360 aplica `.light` como default no `<html>`, com toggle e script inline que respeita `localStorage.theme`).
- **Paleta (tokens semânticos em `src/styles.css`, formato `oklch`):**
  - `--primary` verde `oklch(0.52 0.19 145)` (CTA, foco, ativo)
  - `--destructive` vermelho `oklch(0.65 0.2 25)` (erros, exclusão)
  - `--success` = primary; `--warning` amarelo `oklch(0.8 0.15 85)`
  - `--background`, `--foreground`, `--card`, `--muted`, `--accent`, `--border`, `--input`, `--ring` — todos via tokens.
  - Gráficos: `--chart-1..5` (verde, azul, amarelo, rosa, vermelho).
  - Cores customizáveis de cartão: incluem amarelo e rosa (ver `mem://style/color-palette-cards`).
- **Tipografia:** Inter (400/500/600/700) via `<link>` no `__root.tsx`. Nunca serif.
- **Regra crítica:** proibido usar classes de cor cruas (`text-white`, `bg-black`, hex inline). Sempre tokens semânticos.

### Componentes Reutilizáveis (shadcn/ui + custom)

- **UI base (shadcn/new-york):** Button, Input, Select, Checkbox, RadioGroup, Switch, Tabs, Dialog, AlertDialog, Popover, Tooltip, Sonner (toasts), Progress, Skeleton, ScrollArea, DropdownMenu, Accordion.
- **Custom:**
  - `CardIcon` — miniatura retangular do cartão (chip visual, sem círculo central) padronizada em todas as telas.
  - `CardBrand`, `BankLogo` — reconhecimento visual de bandeira/banco.
  - `AutoFitText` — encolhe fonte para caber em containers estreitos.
  - `PaymentDescriptionText` — canoniza descrições de pagamento de fatura.
  - `CategoryPicker` (grupo > subcategoria), `CategoryPieCharts` (interativo, filtra ao clicar).
  - `TransactionItem`, `EmptyState`, `InvoiceEmptyState`, `InvoiceInconsistencyAlert`.
  - `QuickAddTransactionDialog` — despesa/receita/transferência com parcelamento (valor total × valor da parcela × parcela inicial).
  - `CsvImportDialog`, `PdfInvoiceImportDialog`, `PdfStatementImportDialog`.
  - `FinancialChat` — chat de insights.
  - `BottomNav`, `SmartLink`, `ThemeToggle`, `CycleMismatchDevBanner`.
- **Ícones:** `lucide-react`.

### Responsividade

- **Mobile‑first.** Container principal é `max-w-md mx-auto` (largura de smartphone), com `pb-16` para acomodar o `BottomNav` fixo.
- Uso consistente de `min-h-dvh` (não `h-screen`) para fix de teclado virtual em iOS/Android.
- Breakpoints Tailwind padrão (sm/md/lg/xl) usados em contextos específicos como modo de comparação de tema (`?compare=theme`).

### Acessibilidade (WCAG 2.1 AA)

- `useContrastChecker` roda no root para monitorar contraste em dev.
- `aria-label` em botões só‑ícone; foco visível global (ring com `--ring`).
- Formato de vencimento canonizado por `formatDueDate/Label/AriaLabel` (ex.: "Venc. 08/07" com `aria-label="Vencimento em 08/07"`, fallback "Venc. --/--" → "Vencimento indisponível").
- Testes automáticos (`e2e/a11y*.spec.ts`, `axe-core`, `due-date-aria-attributes.spec.ts`).

### Performance

- SSR (TanStack Start + Cloudflare Workers).
- Lazy‑load de `BottomNav`, `CycleMismatchDevBanner`, importadores de PDF/CSV.
- TanStack Query com invalidação seletiva; snapshot de ordem de fatura para evitar re‑render disruptivo (`invoice-order-snapshot`).
- Skeleton loaders nos principais painéis.

---

## 3. Estrutura de Navegação Global

- **Menu principal:** `BottomNav` fixo (bottom navigation) — padrão mobile.
  - `/` — Início (Home)
  - `/transactions` — Transações
  - `/accounts` — Contas
  - `/cards` — Cartões
  - `/invest` — Investimentos
  - `/insights` — Insights IA (chat)
- **Rotas secundárias (fora do menu principal):**
  - `/auth` — Login / Cadastro (Supabase Auth)
  - `/chat` — Chat financeiro dedicado
  - `/orcametas` — Orçamento + Metas consolidados (abas `?tab=budget|goals`)
  - `/budget` → redireciona para `/orcametas?tab=budget`
  - `/goals` → redireciona para `/orcametas?tab=goals`
  - `/categories` — Gestão de categorias
  - `/reminders` — Lembretes
  - `/reconciliation` — Reconciliação de saldos
  - `/shop` — Assinaturas/planos (placeholder)
- **API pública (server routes):**
  - `POST /api/public/hooks/reconciliation-daily` — webhook agendado (assinatura HMAC).
- **Rodapé:** não há; navegação é 100% via `BottomNav` + links contextuais.
- **Restrição de acesso:** `RootComponent` intercepta sessão via Supabase; sem sessão → redireciona para `/auth`; com sessão em `/auth` → redireciona para `/`.

---

## 4. Detalhamento de Telas

### 4.1. `/auth` — Login / Cadastro

- **Propósito:** Autenticar via Supabase (email/senha; sem confirmação de email por config).
- **Componentes:** email, senha, botão primário "Entrar/Cadastrar", troca de modo, feedback via `sonner`.
- **Fluxo:** validação → `supabase.auth.signInWithPassword` / `signUp` → sucesso redireciona a `/`.
- **Estados:** inicial, loading, erro (`mapServerError` centralizado).
- **Backend:** Supabase Auth. **Hardening pendente**: leaked‑password protection e MFA (TOTP) — configuração manual no dashboard.

### 4.2. `/` — Home

- **Propósito:** Visão geral do mês: contas, cartões (fatura atual), atalhos rápidos.
- **Componentes:**
  - Cabeçalho com saudação + `ThemeToggle` + toggle de privacidade (esconde valores).
  - Bloco "Contas" (cards retangulares com `BankLogo`) — mostra saldo atual (sem "saldo inicial" nem "previsto fim do mês", removidos).
  - Bloco "Cartões" — cada cartão com `CardIcon`, nome, `Venc. dd/mm`, valor da fatura à direita e selo (`Paga` / `Parcial` / `Em aberto` / `Sem fatura`).
  - Navegador de mês (`< agosto >`) sincronizado com `/cards`.
  - Quick actions: adicionar transação, ver todas.
- **Interações:** clique em conta → `/accounts`; clique em cartão → dialog de fatura em `/cards`; navegador de mês altera `activePeriod`.
- **Estados:** loading (skeleton), vazio (mensagem CTA "adicionar conta/cartão"), erro.
- **Backend:** múltiplas queries Supabase (accounts, cards, transactions, card_payments).

### 4.3. `/transactions` — Transações

- **Propósito:** Listar, filtrar, criar, editar, excluir transações.
- **Componentes:** filtros (busca, tipo, período, categoria, conta, cartão), `CategoryPieCharts` (Despesas e Receitas — clicar filtra), lista `TransactionItem` com badge de parcela (`5/7` em âmbar), FAB "adicionar".
- **Interações:**
  - Adicionar via `QuickAddTransactionDialog` (despesa/receita/transferência).
  - Cartão de crédito: escolher entre "Valor total" vs "Valor da parcela" e definir parcela inicial (ex.: começar em 3/7).
  - Editar categoria de uma parcela → pergunta se propaga para demais.
  - Editar valor: rascunho versionado (V1/V2/V3) com sanitização de payload e drift financeiro ≤ N¢.
  - Excluir transação, com confirmação. Instalments removidos via `installment-delete`.
- **Estados:** loading, vazio, erro.
- **Backend:** tabelas `transactions`, `categories`, `subcategories`; endpoints PATCH transacionais com rollback e versionamento.

### 4.4. `/accounts` — Contas

- **Propósito:** Gerenciar contas bancárias e ver saldo consolidado.
- **Componentes:** lista com `BankLogo`, saldo por conta, botão adicionar, dialog de edição, importador CSV (`CsvImportDialog`) com mapeamento manual e auto‑categorização por keywords.
- **Interações:** CRUD + import CSV com prevenção de duplicatas.
- **Estados:** loading, vazio, erro; feedback via toast.
- **Backend:** `bank_accounts`, `transactions` (para recálculo em `recalculate-balances`).

### 4.5. `/cards` — Cartões

- **Propósito:** Gestão de cartões de crédito e faturas.
- **Componentes:**
  - Lista de cartões (drag‑and‑drop via `SortableCardWrapper`, `@dnd-kit`).
  - Cada cartão exibe: `CardIcon`, nome, limite/disponível (à direita, alinhado ao "Pago"), `Fecha dd/mm` e `Vence dd/mm` sem fundo destacado, selo "PARCIALMENTE PAGA" na base‑esquerda quando aplicável.
  - Cálculo `Disponível = Limite − (fatura atual + fatura futura) + pagamentos`.
  - Dialog "Composição da fatura" com transações ordenadas cronologicamente ASC (mais antiga → mais recente), badge de parcela (`5/7`), preservação de ordem via `invoiceOrderRef` (edições não embaralham).
  - Dialog "Pagar Fatura" — usa `formatDueLabel(activePeriod.dueDate)` no cabeçalho.
  - Excluir pagamento individual da composição com confirmação.
  - Importador PDF de fatura (`PdfInvoiceImportDialog`) via `pdfjs-dist` + Lovable AI.
  - Navegador de mês.
- **Interações:** CRUD cartão; pagar fatura total/parcial (com `target_period` vinculando à fatura correta); reordenar cartões.
- **Estados:** loading, vazio (`InvoiceEmptyState` variantes "Nenhuma transação" e "Somente pagamentos"), erro.
- **Backend:** `cards`, `card_payments` (com `target_period`), `transactions`.

### 4.6. `/orcametas` — Orçamento + Metas (consolidada)

- **Propósito:** Unificar orçamento por categoria e metas de economia.
- **Abas via URL:** `?tab=budget` | `?tab=goals` (navegação determinística com `history.replaceState`).
- **Componentes:** progress bars, edição inline, criação de meta com prazo e valor alvo.
- **Backend:** `budget_categories`, `goals`.

### 4.7. `/reminders` — Lembretes

- **Propósito:** Contas a pagar/receber recorrentes.
- **Componentes:** lista, criação com datepicker, quick actions no calendário.
- **Backend:** `reminders`.

### 4.8. `/categories` — Categorias

- **Propósito:** Gerenciar árvore hierárquica "Grupo > Subcategoria" via `CategoryPicker`.
- **Base:** `src/lib/categories.ts` (inclui "Pagamento de Cartão" 💳 com resolução tolerante — case‑insensitive, sem acentos).

### 4.9. `/insights` — Insights IA (Chat)

- **Propósito:** Chat de análise financeira sobre o mês vigente.
- **Componentes:** `FinancialChat` (layout single‑column, mensagens em stream), atalhos de perguntas comuns.
- **Backend:** Supabase Edge Function `financial-chat` + Lovable AI Gateway.

### 4.10. `/chat`

- Chat completo dedicado, mesma engine do `/insights`.

### 4.11. `/invest` — Investimentos

- **Propósito:** Rastrear investimentos (aportes, rendimento, cálculo consolidado).
- **Backend:** `investments.functions.ts` (server functions), lib `investments-calc`.

### 4.12. `/reconciliation` — Reconciliação

- **Propósito:** Motor de reconciliação diária + relatório de consistência de cartões.
- **Componentes:** dashboard com divergências, resumo por conta/cartão, botão "reconciliar agora".
- **Backend:** `reconciliation/engine.ts`, `reconciliation.functions.ts`, webhook `/api/public/hooks/reconciliation-daily`.

### 4.13. `/shop`

- Placeholder para futuros planos/assinaturas.

---

## 5. Aspectos Técnicos

### Stack

- **Framework:** TanStack Start v1 (React 19, Vite 7, SSR em Cloudflare Workers com `nodejs_compat`).
- **Roteamento:** file‑based em `src/routes/` (`routeTree.gen.ts` gerado).
- **State:** TanStack Query (loader + `useSuspenseQuery`); zustand pontual em dialogs.
- **UI:** Tailwind v4 (via `@tailwindcss/vite`), shadcn/ui new‑york, lucide.
- **Formulários:** react‑hook‑form + zod + `@hookform/resolvers`.
- **Drag & drop:** @dnd‑kit.
- **Testes:** Vitest + React Testing Library (unitários), Playwright (`e2e/`), axe‑core (a11y).

### Autenticação & Autorização

- **Supabase Auth** (email/senha, sessão persistida em `localStorage`).
- Middleware `requireSupabaseAuth` para server functions protegidas.
- `attachSupabaseAuth` como `functionMiddleware` no `src/start.ts`.
- `has_role(_user_id, _role app_role)` (SECURITY DEFINER) para RBAC — atualmente só perfil de usuário final; papéis administrativos ainda não expostos na UI.

### API

- **Server functions (RPC tipado):** `src/lib/**/*.functions.ts` — investimentos, reconciliação, patch de transações.
- **Server routes públicas:** `src/routes/api/public/hooks/reconciliation-daily.ts` (webhook com HMAC).
- **Edge Functions Supabase:** `financial-chat`, `run-ai-tests`, `validate-agreement`.
- **Rate limiting:** confiado no Supabase + Lovable AI Gateway. **Gap:** sem rate limit próprio no webhook (só validação de assinatura).

### Persistência

- **Postgres via Supabase** com RLS em todas as tabelas.
- **Tabelas principais:** `bank_accounts`, `cards`, `card_payments` (com `target_period`), `transactions` (com metadata de parcelas), `categories`, `subcategories`, `budget_categories`, `goals`, `reminders`, `investments`, `user_roles`.
- Migrações em `supabase/migrations/` (mais recentes cobrem `target_period`, `Pagamento de Cartão`, reconciliação).
- **RBAC:** `user_roles` + enum `app_role` + `has_role()`.

### CI/CD

- `.github/workflows/ci.yml` — build + testes + lint em PR.
- `.github/workflows/security-scan.yml` — `bun audit` + `check-supabase-auth.mjs` + comentário na PR.

### Monitoramento & Logs

- Logs de server functions via Lovable stack; edge function logs via Supabase.
- Sem APM externo configurado (gap potencial).

---

## 6. Checklist de Qualidade e Divergências

Legenda: ✅ ok · ⚠️ atenção · ❌ pendente.

| Item | Status | Observações |
|---|---|---|
| **Consistência visual** | ✅ | Tokens semânticos aplicados; guard estático contra hex/`text-white`. |
| **Funcionalidade core** | ✅ | Contas, cartões, transações, orçamento, metas, reconciliação, chat IA todos operacionais. |
| **Fluxos de usuário** | ✅ | Mobile‑first com `BottomNav`; quick actions padronizadas. |
| **Feedback ao usuário** | ✅ | Toasts (`sonner`), skeletons, `mapServerError` centralizado. |
| **Tratamento de erros** | ✅ | `ErrorComponent` root + `notFoundComponent`; `mapServerError` em todas as mutations. |
| **Responsividade** | ✅ | `max-w-md`, `min-h-dvh`, safe‑area para `BottomNav`. |
| **Acessibilidade** | ✅ | `aria-label`, foco visível, testes axe + Playwright; `Vencimento em dd/mm`. |
| **Performance** | ✅ | Lazy imports, snapshot de ordem de fatura, `defaultPreloadStaleTime`. |
| **Segurança de autenticação** | ⚠️ | **Leaked‑password protection** e **MFA (TOTP)** dependem de toggle manual no Supabase. |
| **Segurança de endpoints** | ⚠️ | Finding aberto: `parseCardInvoicePdf` server fn ainda **sem `requireSupabaseAuth`** — consome créditos IA sem login. |
| **Security definers** | ⚠️ | 2 funções `SECURITY DEFINER` executáveis por usuários autenticados (finding do scanner). Reavaliar necessidade/permissão. |
| **CORS de edge function legada** | ⚠️ | `validate-agreement` permite `*` (finding `WILDCARD_CORS`). Restringir à origem do app. |
| **Integridade de dados** | ✅ | PATCH transacional com rollback; `target_period` corrige divergência de pagamentos entre faturas; reconciliação diária. |
| **SSR direto (deep‑link)** | ❌ | **Constraint documentada:** acesso direto por URL falha (hidratação); só navegação via `SmartLink` funciona. Precisa investigação. |
| **Manutenibilidade** | ✅ | Componentes de `cards.tsx` extraídos; libs isoladas (`format-due-date`, `card-payment-label`, `invoice-utils`, `installment-*`). |
| **Cobertura de testes** | ✅ | Suítes de unidade, snapshot, integração e e2e; guards estáticos anti‑regressão (ex.: `no-fatura-month-concat`). |
| **APM/observabilidade** | ⚠️ | Sem ferramenta externa (Sentry/Datadog). Depende de logs Lovable + Supabase. |
| **Rate limiting próprio** | ⚠️ | Webhook `reconciliation-daily` validado por HMAC, mas sem throttling; delegado a plataforma. |
| **i18n** | ➖ | App é pt‑BR only por design. Sem suporte multi‑idioma. |
| **Perfil de usuário** | ❌ | Não há tela `/perfil` para editar dados básicos, alterar senha, gerenciar MFA. Gap relevante. |
| **Área administrativa** | ❌ | RBAC preparado (`has_role`), mas sem UI de admin. |
| **Logout** | ⚠️ | Não há botão de logout claramente exposto na UI (verificar `ThemeToggle`/Home). |

### Divergências registradas vs. template

- Sem "Dashboard admin" / "Gerenciamento de usuários" — não é objetivo do produto atual.
- Sem breadcrumbs — a estrutura mobile é rasa, breadcrumbs não agregam.
- Rodapé não existe (app‑shell mobile).

---

## 7. Próximos Passos Recomendados

**Segurança (curto prazo):**
1. Adicionar `requireSupabaseAuth` em `parseCardInvoicePdf` (finding `UNAUTHENTICATED_ENDPOINT`).
2. Restringir CORS de `validate-agreement` à origem publicada.
3. Habilitar Leaked Password Protection e MFA (TOTP) no dashboard Supabase; construir UI de enroll em `/perfil`.
4. Revisar as 2 funções `SECURITY DEFINER` — restringir `EXECUTE` ou remover se obsoletas.

**UX (curto prazo):**
5. Criar `/perfil` (editar nome/email/senha, gerenciar MFA, logout visível).
6. Investigar constraint de SSR/deep‑link (hidratação em acesso direto).

**Plataforma (médio prazo):**
7. Integrar APM (Sentry) para erros de client + server.
8. Publicar OpenAPI/JSDoc das server functions expostas.
9. Rate limit explícito nos webhooks públicos.
10. Auditar `SECURITY DEFINER` e políticas RLS com o linter Supabase em CI.

---

*Última atualização: 2026‑07 (build mode). Editar este arquivo em PRs conforme o produto evoluir.*
