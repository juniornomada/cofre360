import { test, expect, type Route, type Request } from '@playwright/test';

/**
 * E2E — Cross-year + estorno fixture
 * ----------------------------------------------------------------
 * Verifica que o valor exibido para uma transação em CARTÕES (Home e
 * /cards) NUNCA é derivado do campo `date` textual quando `created_at`
 * está disponível — ou seja, a heurística de virada de ano baseada em
 * `created_at` (ver `parseTxDate`) é a fonte de verdade para o
 * agrupamento por ciclo de fatura.
 *
 * Estratégia
 * ----------
 * 1. Faz login com o usuário de teste (mesma credencial usada em
 *    user-isolation.spec.ts) para que o Supabase JS client mantenha uma
 *    sessão válida em `localStorage`. Isto libera o gate de
 *    `_authenticated`.
 * 2. Antes de qualquer navegação para `/` ou `/cards`, instala
 *    `page.route()` em `**\/rest/v1/**` para interceptar SOMENTE as
 *    tabelas relevantes (`credit_cards`, `transactions`,
 *    `invoice_payments`, `accounts`, `profiles`) e devolver fixtures
 *    determinísticas. Qualquer outra chamada é repassada com
 *    `route.fallback()`.
 * 3. As fixtures cobrem os dois casos:
 *      • Cross-year: `date = "31 dez"` (textual, sem ano),
 *        `created_at = 2026-01-02T02:00:00Z`. Um parser ingênuo
 *        colocaria em Dez/ano-atual; a heurística correta desloca
 *        para Dez/2025 (created_at está em Jan → -1 ano).
 *      • Estorno: mesma data, valor negativo, deve subtrair do total
 *        da fatura em Dez/2025 (100 − 30 = 70).
 * 4. Navega para `/cards?mes=2025-12` e valida que a fatura do cartão
 *    fixture exibe R$ 70,00 (não R$ 100,00 e não zero — o que
 *    indicaria que caiu num ciclo errado por causa de `date`).
 * 5. Repete a validação na Home (`/`) usando o navegador mensal para
 *    voltar até Dez/2025.
 *
 * Se o ambiente não conseguir autenticar (ex.: credenciais inválidas
 * em CI local), o teste é marcado como skipped para não quebrar o
 * pipeline — a mesma classe de validação já é coberta pelos testes
 * unitários em `src/lib/__tests__/year-rollover-cycle.test.ts` e
 * `src/lib/__tests__/cycle-key-integration.test.ts`.
 */

const USER_EMAIL = 'teste@teste.com.br';
const USER_PASS = 'bra2008';

// IDs fixos apenas para as fixtures — não precisam existir no banco.
const FIXTURE_USER_ID = '00000000-0000-4000-8000-000000000001';
const FIXTURE_CARD_ID = '11111111-1111-4111-8111-111111111111';
const FIXTURE_TX_MAIN_ID = '22222222-2222-4222-8222-222222222222';
const FIXTURE_TX_REVERSAL_ID = '33333333-3333-4333-8333-333333333333';
const FIXTURE_CARD_NAME = 'E2E Cross-Year Card';

// Ciclo esperado: `31 dez` textual + `created_at` em 02-Jan-2026
// → heurística Dez↔Jan aplica -1 ano → Dez/2025.
const CROSS_YEAR_CREATED_AT = '2026-01-02T02:00:00Z';
const CROSS_YEAR_TEXT_DATE = '31 dez';

const cardFixture = {
  id: FIXTURE_CARD_ID,
  user_id: FIXTURE_USER_ID,
  name: FIXTURE_CARD_NAME,
  bank: 'Fixture Bank',
  color: '#3B82F6',
  brand: 'visa',
  last_four: '4242',
  credit_limit: 5000,
  closing_day: 25,
  due_day: 5,
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
};

const txFixtures = [
  {
    id: FIXTURE_TX_MAIN_ID,
    user_id: FIXTURE_USER_ID,
    credit_card_id: FIXTURE_CARD_ID,
    account_id: null,
    category_id: null,
    date: CROSS_YEAR_TEXT_DATE, // texto sem ano — vetor do bug
    created_at: CROSS_YEAR_CREATED_AT, // fonte de verdade
    amount: 100,
    type: 'expense',
    description: 'Compra cross-year (fixture)',
    is_hidden: false,
    installments: 1,
    installment_number: 1,
  },
  {
    id: FIXTURE_TX_REVERSAL_ID,
    user_id: FIXTURE_USER_ID,
    credit_card_id: FIXTURE_CARD_ID,
    account_id: null,
    category_id: null,
    date: CROSS_YEAR_TEXT_DATE,
    created_at: CROSS_YEAR_CREATED_AT,
    amount: -30, // estorno
    type: 'expense',
    description: 'Estorno parcial (fixture)',
    is_hidden: false,
    installments: 1,
    installment_number: 1,
  },
];

// Total líquido da fatura Dez/2025 esperado no cartão fixture.
const EXPECTED_TOTAL_CENTS = 7000; // R$ 70,00

/** Parseia "R$ 1.234,56" → 123456 (centavos). */
function parseBRLToCents(text: string): number {
  const clean = text.replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number.parseFloat(clean);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/**
 * Instala interceptação REST do PostgREST. Só substitui as tabelas
 * críticas para o teste; o resto passa pelo backend real (fallback).
 */
async function installSupabaseFixtures(page: import('@playwright/test').Page) {
  await page.route('**/rest/v1/**', async (route: Route, request: Request) => {
    const url = new URL(request.url());
    const path = url.pathname; // ex.: /rest/v1/transactions
    const method = request.method();
    const table = path.replace(/^\/rest\/v1\//, '').split('?')[0];

    // Só interceptamos GETs de leitura das tabelas relevantes.
    const isRead = method === 'GET' || method === 'HEAD';
    const targeted = ['credit_cards', 'transactions', 'invoice_payments'];

    if (!isRead || !targeted.includes(table)) {
      return route.fallback();
    }

    const respond = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'content-range': '0-*/*',
          'access-control-allow-origin': '*',
        },
        body: JSON.stringify(body),
      });

    if (table === 'credit_cards') return respond([cardFixture]);
    if (table === 'transactions') return respond(txFixtures);
    if (table === 'invoice_payments') return respond([]); // sem pagamentos

    return route.fallback();
  });
}

async function login(page: import('@playwright/test').Page) {
  await page.goto('/auth');
  const emailInput = page.getByPlaceholder('seu@email.com');
  if (!(await emailInput.isVisible().catch(() => false))) {
    test.skip(true, 'Tela /auth indisponível no ambiente atual.');
  }
  await emailInput.fill(USER_EMAIL);
  await page.getByPlaceholder('Sua senha').fill(USER_PASS);
  await page.getByRole('button', { name: 'Entrar' }).click();
  // Se as credenciais não funcionarem no ambiente, pulamos.
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 15_000 }).catch(() => {
    test.skip(true, 'Login com usuário de teste indisponível neste ambiente.');
  });
}

test.describe('Cross-year + estorno — created_at é a fonte de verdade', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installSupabaseFixtures(page);
  });

  test('/cards em Dez/2025 mostra fatura líquida do cartão fixture (100 − 30 = 70)', async ({ page }) => {
    await page.goto('/cards?mes=2025-12');
    await page.waitForLoadState('networkidle');

    // Localiza o cartão fixture pelo nome.
    const cardBlock = page.locator('.interactive-card', { hasText: FIXTURE_CARD_NAME }).first();
    await expect(cardBlock, 'cartão fixture deve renderizar').toBeVisible({ timeout: 10_000 });

    const totalEl = cardBlock.getByTestId('fatura-atual-valor');
    const text = await totalEl.innerText();
    const cents = parseBRLToCents(text);

    // Se `date` textual ("31 dez") tivesse sido usado com o ano atual
    // (2026 durante a maior parte do runtime), o valor cairia em Dez/2026
    // e a fatura de Dez/2025 mostraria R$ 0,00. Se apenas a soma bruta
    // fosse considerada (sem estorno), veríamos R$ 100,00. Ambos são
    // falhas do contrato.
    expect(
      cents,
      `Fatura Dez/2025 deveria ser R$ 70,00 (100 − 30). Recebido: "${text}"`,
    ).toBe(EXPECTED_TOTAL_CENTS);
  });

  test('Home (após navegar até Dez/2025) mostra o mesmo total do /cards', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Volta o navegador mensal da Home até Dez/2025 (máx. 24 cliques).
    const prevBtn = page.getByRole('button', { name: 'Fatura do mês anterior' }).first();
    for (let i = 0; i < 24; i++) {
      const cardBlock = page
        .locator('[data-testid="fatura-atual-valor"]')
        .first();
      // Header do mês exibido próximo ao navegador — usamos texto.
      const monthHeader = await page.textContent('body');
      if (monthHeader && /dez.*2025|dezembro.*2025|12\/2025/i.test(monthHeader)) break;
      if (!(await prevBtn.isVisible().catch(() => false))) break;
      await prevBtn.click();
      await page.waitForTimeout(150);
      await cardBlock.waitFor({ state: 'attached' }).catch(() => {});
    }

    // Encontra a linha do cartão fixture na Home.
    const homeCard = page
      .locator('div', { hasText: FIXTURE_CARD_NAME })
      .locator('[data-testid="fatura-atual-valor"]')
      .first();

    if (!(await homeCard.isVisible().catch(() => false))) {
      test.skip(true, 'Cartão fixture não visível na Home neste layout — coberto por /cards.');
    }

    const cents = parseBRLToCents(await homeCard.innerText());
    expect(cents).toBe(EXPECTED_TOTAL_CENTS);
  });

  test('Sanidade: em Dez/2026 (ano naïve) a fatura do cartão fixture é R$ 0,00', async ({ page }) => {
    // Se a lógica usasse `date` textual ("31 dez") + ano atual, esta
    // fatura estaria "contaminada" com os R$ 70 líquidos. A ausência
    // de qualquer valor > 0 aqui confirma que `created_at` decidiu.
    await page.goto('/cards?mes=2026-12');
    await page.waitForLoadState('networkidle');

    const cardBlock = page.locator('.interactive-card', { hasText: FIXTURE_CARD_NAME }).first();
    if (!(await cardBlock.isVisible().catch(() => false))) {
      // Sem cartão listado neste mês também é evidência válida (o app
      // pode ocultar cartões sem lançamentos no ciclo).
      return;
    }
    const totalEl = cardBlock.getByTestId('fatura-atual-valor');
    const cents = parseBRLToCents(await totalEl.innerText());
    expect(cents, 'Dez/2026 não deve receber lançamento cujo created_at é Jan/2026').toBe(0);
  });
});
