import { test, expect, type Route, type Request, type Page } from '@playwright/test';

/**
 * E2E — AutoFitText no diálogo da fatura em /cards
 * ----------------------------------------------------------------
 * Objetivo
 *  Garantir que quando a descrição de uma transação da fatura é longa
 *  a ponto de estourar o container mesmo no piso de font-size do
 *  `AutoFitText`, a UI:
 *   1. Mantém o texto **completo** no DOM (acessibilidade / leitores
 *      de tela recebem tudo, não uma versão cortada).
 *   2. Aplica o fallback visual de `text-ellipsis` (`overflow-hidden`
 *      + `text-ellipsis` + `whitespace-nowrap`).
 *   3. Expõe o texto integral via atributo `title`, servindo como
 *      tooltip nativo do navegador ao passar o mouse.
 *
 * Estratégia
 *  ▸ Intercepta o PostgREST e devolve fixtures determinísticas com um
 *    cartão e uma transação cuja `name` tem ~220 caracteres — larga o
 *    bastante para transbordar mesmo no piso de 10px do AutoFitText
 *    em viewports mobile-first.
 *  ▸ Força viewport estreito (`375x800`) para reproduzir o cenário
 *    real de fallback a ellipsis.
 *  ▸ Abre o diálogo, localiza o `<span>` renderizado pelo AutoFitText
 *    dentro de `data-testid="invoice-transaction-name"` e verifica:
 *      • `textContent` contém a descrição integral (nada é truncado
 *        em JS antes de chegar ao DOM);
 *      • o span está com `overflow: hidden` + `text-overflow: ellipsis`;
 *      • o atributo `title` reflete a descrição completa.
 */

const USER_EMAIL = 'teste@teste.com.br';
const USER_PASS = 'bra2008';

const FIXTURE_USER_ID = '00000000-0000-4000-8000-0000000000ff';
const FIXTURE_CARD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FIXTURE_TX_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const CARD_NAME = 'Porto Bank Longtext';

/**
 * Descrição extremamente longa (~230 chars): mistura acentos,
 * pontuação e whitespace regular para reproduzir cenários reais de
 * importações OFX/CSV em que o payload vem cheio de metadados.
 * Não usar zero-width chars — queremos overflow "honesto".
 */
const LONG_DESCRIPTION =
  'Compra internacional em loja parceira de eletrônicos e acessórios premium com frete expresso, garantia estendida internacional, seguro contra roubo e furto, e cashback promocional para clientes fidelidade categoria ouro plus 2026';

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

function makeTransaction() {
  return {
    id: FIXTURE_TX_ID,
    user_id: FIXTURE_USER_ID,
    icon: '🛒',
    name: LONG_DESCRIPTION,
    category: 'Compras',
    date: '2026-07-10',
    amount: 429.9,
    type: 'expense',
    card: CARD_NAME,
    bank_account_id: null,
    installment_group_id: null,
    installment_number: 1,
    total_installments: 1,
    installment_mode: null,
    installment_source_amount: null,
    is_visible: true,
    created_at: '2026-07-10T13:00:00.000Z',
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
    if (table === 'transactions') return respond([makeTransaction()]);
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

test.describe('/cards — AutoFitText com descrição longa', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await installFixtures(page);
    await login(page);
  });

  test('descrição longa preserva texto completo, aplica ellipsis e expõe tooltip via title', async ({ page }) => {
    await page.goto('/cards');
    await page.waitForLoadState('networkidle');

    // Abre o diálogo da fatura do cartão fixture.
    const cardTrigger = page.getByText(CARD_NAME).first();
    await expect(cardTrigger, 'Cartão fixture deve aparecer em /cards').toBeVisible({ timeout: 10_000 });
    await cardTrigger.click();

    const dialog = page.getByTestId('invoice-dialog').first();
    await expect(dialog, 'Diálogo da fatura deve abrir').toBeVisible({ timeout: 5_000 });

    // Localiza a linha da transação com descrição longa.
    const txName = dialog.getByTestId('invoice-transaction-name').first();
    await expect(txName).toBeVisible();

    // 1) Texto completo permanece no DOM (nada truncado em JS).
    const domText = (await txName.textContent()) ?? '';
    expect(
      domText,
      'DOM deve conter a descrição integral — AutoFitText nunca corta em JS',
    ).toContain(LONG_DESCRIPTION);

    // O <span> raiz do AutoFitText é o único filho direto do <p>.
    const autoFitSpan = txName.locator('span').first();
    await expect(autoFitSpan).toBeVisible();

    // Aguarda a medição do ResizeObserver + rAF concluir. O componente
    // marca `overflowing` num estado assíncrono; damos ao browser dois
    // ticks de layout antes de checar as classes/atributos derivados.
    await page.waitForTimeout(150);
    await page.evaluate(
      () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    );

    // 2) Fallback visual: overflow:hidden + text-overflow:ellipsis + nowrap.
    const styles = await autoFitSpan.evaluate((el) => {
      const cs = window.getComputedStyle(el as HTMLElement);
      return {
        overflow: cs.overflow,
        textOverflow: cs.textOverflow,
        whiteSpace: cs.whiteSpace,
        fontSizePx: parseFloat(cs.fontSize),
        scrollWidth: (el as HTMLElement).scrollWidth,
        clientWidth: (el as HTMLElement).clientWidth,
        parentClientWidth: ((el as HTMLElement).parentElement as HTMLElement | null)?.clientWidth ?? 0,
      };
    });

    expect(styles.whiteSpace, 'AutoFitText mantém single-line').toBe('nowrap');
    expect(
      styles.overflow,
      'Quando há overflow persistente, o container deve ocultar o excesso',
    ).toBe('hidden');
    expect(
      styles.textOverflow,
      'Fallback visual deve ser "ellipsis" quando o piso de font-size não coube',
    ).toBe('ellipsis');
    // Sanidade: o texto DEVE estar excedendo o container, senão o
    // teste não está exercitando o cenário de fallback.
    expect(
      styles.scrollWidth,
      'Cenário inválido: descrição não transbordou — aumente LONG_DESCRIPTION ou reduza o viewport',
    ).toBeGreaterThan(styles.clientWidth);

    // 3) Tooltip nativo: o `title` deve carregar o texto completo,
    // incluindo a descrição longa integral (o AutoFitText concatena
    // via extractText o children).
    const titleAttr = await autoFitSpan.getAttribute('title');
    expect(titleAttr, 'title deve existir quando o texto cai em ellipsis').not.toBeNull();
    expect(
      titleAttr ?? '',
      'title deve conter a descrição integral para tooltip nativo',
    ).toContain(LONG_DESCRIPTION);
  });
});
