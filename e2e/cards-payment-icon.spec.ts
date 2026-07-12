import { test, expect, type Route, type Request, type Page } from '@playwright/test';

/**
 * E2E — Ícone 💳 para categoria "Pagamento de Cartão" em /cards
 * ----------------------------------------------------------------
 * Objetivo
 *  Garantir que, ao renderizar a fatura de um cartão no diálogo de
 *  /cards, transações cuja categoria pertence ao grupo
 *  "Pagamento de Cartão" (raiz e subcategorias) exibem o emoji 💳
 *  no bloco de ícone do TransactionItem, com aria-label refletindo
 *  a categoria — evitando o fallback genérico 📄.
 *
 * Estratégia
 *  ▸ Intercepta o PostgREST e devolve fixtures determinísticas com
 *    um cartão fixture e três transações lançadas como pagamento:
 *      1. Categoria raiz "Pagamento de Cartão"
 *      2. Subcategoria "Pagamento de Cartão > Pagamento Total"
 *      3. Subcategoria "Pagamento de Cartão > Pagamento Parcial"
 *  ▸ Abre o diálogo da fatura e localiza cada item pelo
 *    data-testid="invoice-transaction-item".
 *  ▸ Assere que cada linha renderiza um <span role="img"> com
 *    textContent === '💳' e aria-label começando com a categoria.
 */

const USER_EMAIL = 'teste@teste.com.br';
const USER_PASS = 'bra2008';

const FIXTURE_USER_ID = '00000000-0000-4000-8000-0000000000ff';
const FIXTURE_CARD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const CARD_NAME = 'Porto Bank Pagamentos';

const cardFixture = {
  id: FIXTURE_CARD_ID,
  user_id: FIXTURE_USER_ID,
  name: CARD_NAME,
  emoji: '💳',
  color: '#3B82F6',
  is_visible: true,
  closing_day: 25,
  due_day: 5,
  sort_order: 0,
  credit_limit: 8000,
  created_at: '2025-01-01T00:00:00.000Z',
};

type Tx = {
  id: string;
  name: string;
  category: string;
  amount: number;
  date: string;
};

const PAYMENT_TXS: Tx[] = [
  {
    id: 'dddddddd-dddd-4ddd-8ddd-ddddddddd001',
    name: `Pagamento cartão ${CARD_NAME}`,
    category: 'Pagamento de Cartão',
    amount: 500,
    date: '2026-07-05',
  },
  {
    id: 'dddddddd-dddd-4ddd-8ddd-ddddddddd002',
    name: `Pagamento Total cartão ${CARD_NAME}`,
    category: 'Pagamento de Cartão > Pagamento Total',
    amount: 800,
    date: '2026-07-06',
  },
  {
    id: 'dddddddd-dddd-4ddd-8ddd-ddddddddd003',
    name: `Pagamento Parcial cartão ${CARD_NAME}`,
    category: 'Pagamento de Cartão > Pagamento Parcial',
    amount: 300,
    date: '2026-07-07',
  },
];

function makeTransaction(tx: Tx) {
  return {
    id: tx.id,
    user_id: FIXTURE_USER_ID,
    icon: '💳',
    name: tx.name,
    category: tx.category,
    date: tx.date,
    amount: tx.amount,
    type: 'expense',
    card: CARD_NAME,
    bank_account_id: null,
    installment_group_id: null,
    installment_number: 1,
    total_installments: 1,
    installment_mode: null,
    installment_source_amount: null,
    is_visible: true,
    created_at: `${tx.date}T13:00:00.000Z`,
  };
}

async function installFixtures(page: Page) {
  await page.route('**/rest/v1/**', async (route: Route, request: Request) => {
    const url = new URL(request.url());
    const table = url.pathname.replace(/^\/rest\/v1\//, '').split('?')[0];
    const isRead = request.method() === 'GET' || request.method() === 'HEAD';
    if (!isRead) return route.fallback();

    const respond = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-*/*' },
        body: JSON.stringify(body),
      });

    if (table === 'cards') return respond([cardFixture]);
    if (table === 'transactions') return respond(PAYMENT_TXS.map(makeTransaction));
    if (table === 'card_payments') return respond([]);
    return route.fallback();
  });
}

async function login(page: Page) {
  await page.goto('/auth');
  const emailInput = page.getByPlaceholder('seu@email.com');
  if (!(await emailInput.isVisible().catch(() => false))) {
    test.skip(true, 'Tela /auth indisponível no ambiente atual.');
  }
  await emailInput.fill(USER_EMAIL);
  await page.getByPlaceholder('Sua senha').fill(USER_PASS);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page
    .waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 15_000 })
    .catch(() => test.skip(true, 'Login indisponível neste ambiente.'));
}

test.describe('/cards — ícone 💳 para "Pagamento de Cartão"', () => {
  test.beforeEach(async ({ page }) => {
    await installFixtures(page);
    await login(page);
  });

  test('cada transação de pagamento renderiza 💳 no TransactionItem', async ({ page }) => {
    await page.goto('/cards');
    await page.waitForLoadState('networkidle');

    const cardTrigger = page.getByText(CARD_NAME).first();
    await expect(cardTrigger, 'Cartão fixture deve aparecer em /cards').toBeVisible({ timeout: 10_000 });
    await cardTrigger.click();

    const dialog = page.getByTestId('invoice-dialog').first();
    await expect(dialog, 'Diálogo da fatura deve abrir').toBeVisible({ timeout: 5_000 });

    const items = dialog.getByTestId('invoice-transaction-item');
    await expect(items).toHaveCount(PAYMENT_TXS.length);

    for (const tx of PAYMENT_TXS) {
      // Localiza a linha exata pelo nome canônico da transação.
      const row = dialog
        .getByTestId('invoice-transaction-item')
        .filter({ hasText: tx.name })
        .first();
      await expect(row, `Linha visível para "${tx.name}"`).toBeVisible();

      // O ícone da categoria é o primeiro <span role="img"> não-hidden
      // dentro do bloco 40x40 do TransactionItem.
      const iconSpan = row.locator('span[role="img"]:not([aria-hidden="true"])').first();
      await expect(iconSpan, `Ícone visível para "${tx.category}"`).toBeVisible();

      const text = (await iconSpan.textContent())?.trim();
      expect(
        text,
        `Categoria "${tx.category}" deve renderizar 💳, não o fallback 📄`,
      ).toBe('💳');

      // Acessibilidade: aria-label reflete a categoria (raiz ou subcategoria).
      const ariaLabel = await iconSpan.getAttribute('aria-label');
      expect(ariaLabel, 'aria-label do ícone deve existir').not.toBeNull();
      expect(
        ariaLabel ?? '',
        `aria-label deve conter a categoria "${tx.category}"`,
      ).toContain('Pagamento de Cartão');
    }
  });
});
