import { test, expect, type Route, type Request, type Page } from '@playwright/test';

/**
 * E2E — Rótulo canônico de vencimento em Home e /cards
 * -----------------------------------------------------
 * Garante que:
 *  1. O rótulo "Venc. dd/mm" (com zero-padding) é renderizado em pelo
 *     menos um lugar visível em cada rota.
 *  2. O texto legado "Fatura {mês}" (Janeiro..Dezembro) NUNCA aparece
 *     na UI — nem em nós de texto, nem em atributos aria-label/title.
 */

const USER_EMAIL = 'teste@teste.com.br';
const USER_PASS = 'bra2008';

const FIXTURE_USER_ID = '00000000-0000-4000-8000-0000000000ff';
const FIXTURE_CARD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccd';
const CARD_NAME = 'Cartão Vencimento E2E';

const cardFixture = {
  id: FIXTURE_CARD_ID,
  user_id: FIXTURE_USER_ID,
  name: CARD_NAME,
  emoji: '💳',
  color: '#3B82F6',
  is_visible: true,
  closing_day: 5,
  due_day: 10,
  sort_order: 0,
  credit_limit: 8000,
  created_at: '2025-01-01T00:00:00.000Z',
};

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

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

/**
 * Extrai TODO o texto visível da página (nós de texto + atributos
 * comumente lidos por leitores de tela: aria-label, title, alt).
 */
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

function assertNoLegacyFaturaMonth(text: string, routeLabel: string) {
  for (const m of MONTH_NAMES) {
    const rx = new RegExp(`Fatura\\s+${m}\\b`, 'i');
    expect(
      rx.test(text),
      `[${routeLabel}] rótulo legado "Fatura ${m}" apareceu na UI`,
    ).toBe(false);
  }
}

function assertVencLabelPresent(text: string, routeLabel: string) {
  // Formato canônico: "Venc. dd/mm" com zero-padding (também aceita o
  // fallback "Venc. --/--" quando não há dados de vencimento).
  const canonical = /Venc\.\s+(\d{2}\/\d{2}|--\/--)/;
  expect(
    canonical.test(text),
    `[${routeLabel}] rótulo "Venc. dd/mm" ausente da UI`,
  ).toBe(true);

  // Nenhuma variação com um dígito só: "Venc. 3/08", "Venc. 10/8", "Venc. 3/8".
  const singleDigit = /Venc\.\s+(\d\/\d{1,2}|\d{1,2}\/\d)\b/;
  const matches = text.match(new RegExp(singleDigit.source, 'g')) || [];
  const bad = matches.filter((m) => !/\d{2}\/\d{2}/.test(m));
  expect(
    bad.length,
    `[${routeLabel}] encontrado rótulo sem zero-padding: ${bad.join(', ')}`,
  ).toBe(0);
}

test.describe('Rótulo de vencimento — Home e /cards', () => {
  test.beforeEach(async ({ page }) => {
    await installFixtures(page);
    await login(page);
  });

  test('Home renderiza "Venc. dd/mm" e não expõe "Fatura {mês}"', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(CARD_NAME).first()).toBeVisible({ timeout: 10_000 });

    const text = await snapshotAccessibleText(page);
    assertNoLegacyFaturaMonth(text, 'Home');
    assertVencLabelPresent(text, 'Home');
  });

  test('/cards renderiza "Venc. dd/mm" e não expõe "Fatura {mês}"', async ({ page }) => {
    await page.goto('/cards');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(CARD_NAME).first()).toBeVisible({ timeout: 10_000 });

    const text = await snapshotAccessibleText(page);
    assertNoLegacyFaturaMonth(text, '/cards');
    assertVencLabelPresent(text, '/cards');
  });

  test('navegação Home → /cards mantém o rótulo canônico consistente', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(CARD_NAME).first()).toBeVisible({ timeout: 10_000 });

    const homeText = await snapshotAccessibleText(page);
    const homeMatch = homeText.match(/Venc\.\s+\d{2}\/\d{2}/);
    expect(homeMatch, 'Home precisa expor pelo menos um "Venc. dd/mm"').not.toBeNull();

    await page.goto('/cards');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(CARD_NAME).first()).toBeVisible({ timeout: 10_000 });

    const cardsText = await snapshotAccessibleText(page);
    const cardsMatch = cardsText.match(/Venc\.\s+\d{2}\/\d{2}/);
    expect(cardsMatch, '/cards precisa expor pelo menos um "Venc. dd/mm"').not.toBeNull();

    // Ambas as rotas devem exibir o MESMO vencimento para o cartão
    // fixture (mesmo closing/due day → mesmo ciclo corrente).
    expect(cardsMatch![0]).toBe(homeMatch![0]);

    assertNoLegacyFaturaMonth(homeText, 'Home');
    assertNoLegacyFaturaMonth(cardsText, '/cards');
  });
});
