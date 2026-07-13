import { test, expect, type Route, type Request, type Page } from '@playwright/test';

/**
 * E2E — Datas inválidas SEMPRE colapsam para "Venc. --/--"
 * ---------------------------------------------------------
 * Simula um cartão cujo `closing_day` / `due_day` são inválidos
 * (fora de faixa) — o pipeline de derivação do ciclo produz um
 * `dueDate` inválido, e o header do cartão DEVE renderizar
 * exatamente "Venc. --/--" tanto na Home quanto em /cards.
 *
 * Se qualquer variante ("Venc. NaN/NaN", "Venc. undefined/undefined",
 * "Fatura {mês}") aparecer, o teste falha.
 */

const USER_EMAIL = 'teste@teste.com.br';
const USER_PASS = 'bra2008';

const FIXTURE_USER_ID = '00000000-0000-4000-8000-0000000000ff';
const FIXTURE_CARD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccdee';
const CARD_NAME = 'Cartão Data Inválida E2E';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/**
 * Cartão fixture com dias de fechamento/vencimento inválidos.
 * O objetivo é forçar o pipeline a produzir um `dueDate` inválido
 * e verificar que o helper `formatDueLabel` cobre o fallback.
 */
const invalidCardFixture = {
  id: FIXTURE_CARD_ID,
  user_id: FIXTURE_USER_ID,
  name: CARD_NAME,
  emoji: '💳',
  color: '#3B82F6',
  is_visible: true,
  closing_day: null as unknown as number,
  due_day: null as unknown as number,
  sort_order: 0,
  credit_limit: 5000,
  created_at: '2025-01-01T00:00:00.000Z',
};

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
    if (table === 'cards') return respond([invalidCardFixture]);
    if (table === 'transactions') return respond([]);
    if (table === 'card_payments') return respond([]);
    if (table === 'bank_accounts' || table === 'accounts') return respond([]);
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

async function snapshotAccessibleText(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const parts: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode as Element | null;
    while (node) {
      const el = node as HTMLElement;
      if (el.getAttribute) {
        for (const attr of ['aria-label', 'title', 'alt']) {
          const v = el.getAttribute(attr);
          if (v) parts.push(v);
        }
      }
      node = walker.nextNode() as Element | null;
    }
    parts.push(document.body.innerText || '');
    return parts.join('\n');
  });
}

function assertInvalidPlaceholderContract(text: string, routeLabel: string) {
  // O placeholder canônico DEVE aparecer pelo menos uma vez.
  expect(
    /Venc\.\s+--\/--/.test(text),
    `[${routeLabel}] rótulo "Venc. --/--" ausente para cartão com data inválida`,
  ).toBe(true);

  // Nunca podemos vazar valores degradados.
  expect(text, `[${routeLabel}] "NaN" vazou na UI`).not.toMatch(/Venc\.\s*NaN/i);
  expect(text, `[${routeLabel}] "undefined" vazou na UI`).not.toMatch(/Venc\.\s*undefined/i);
  expect(text, `[${routeLabel}] "Invalid Date" vazou na UI`).not.toMatch(/Invalid Date/i);

  // Nunca reintroduzir "Fatura {mês}" — nem por acidente.
  for (const m of MONTH_NAMES) {
    const rx = new RegExp(`Fatura\\s+${m}\\b`, 'i');
    expect(rx.test(text), `[${routeLabel}] "Fatura ${m}" apareceu na UI`).toBe(false);
  }
}

test.describe('Datas inválidas — fallback "Venc. --/--" em Home e /cards', () => {
  test.beforeEach(async ({ page }) => {
    await installFixtures(page);
    await login(page);
  });

  test('Home renderiza "Venc. --/--" quando dueDate é inválido', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(CARD_NAME).first()).toBeVisible({ timeout: 10_000 });
    const text = await snapshotAccessibleText(page);
    assertInvalidPlaceholderContract(text, 'Home');
  });

  test('/cards renderiza "Venc. --/--" quando dueDate é inválido', async ({ page }) => {
    await page.goto('/cards');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(CARD_NAME).first()).toBeVisible({ timeout: 10_000 });
    const text = await snapshotAccessibleText(page);
    assertInvalidPlaceholderContract(text, '/cards');
  });

  test('Home ↔ /cards emitem o MESMO placeholder para o mesmo cartão inválido', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(CARD_NAME).first()).toBeVisible({ timeout: 10_000 });
    const homeMatch = (await snapshotAccessibleText(page)).match(/Venc\.\s+--\/--/);
    expect(homeMatch, 'Home precisa expor "Venc. --/--"').not.toBeNull();

    await page.goto('/cards');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(CARD_NAME).first()).toBeVisible({ timeout: 10_000 });
    const cardsMatch = (await snapshotAccessibleText(page)).match(/Venc\.\s+--\/--/);
    expect(cardsMatch, '/cards precisa expor "Venc. --/--"').not.toBeNull();

    expect(cardsMatch![0]).toBe(homeMatch![0]);
  });
});
