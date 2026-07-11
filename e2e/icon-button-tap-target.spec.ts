import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * E2E — Tap target & rótulo acessível para botões só-ícone
 * ----------------------------------------------------------------
 * WCAG 2.1 (AA) recomenda alvo mínimo de 44×44 CSS px em interações
 * de ponteiro. Todo botão só-ícone precisa ainda de `aria-label`,
 * `title` ou `aria-labelledby` para leitores de tela.
 *
 * Estratégia: audita as rotas públicas que podemos abrir sem sessão
 * (`/`, `/auth`) e a `/orcametas` autenticada (com skip se o login
 * indisponível no ambiente).
 */

const MIN_TAP_TARGET_SIZE = 44; // px
const USER_EMAIL = 'teste@teste.com.br';
const USER_PASS = 'bra2008';

async function login(page: Page) {
  await page.goto('/auth');
  const emailInput = page.getByPlaceholder('seu@email.com');
  if (!(await emailInput.isVisible().catch(() => false))) {
    test.skip(true, 'Tela /auth indisponível.');
  }
  await emailInput.fill(USER_EMAIL);
  await page.getByPlaceholder('Sua senha').fill(USER_PASS);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page
    .waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 15_000 })
    .catch(() => {
      test.skip(true, 'Login indisponível neste ambiente.');
    });
}

/**
 * Retorna botões só-ícone visíveis: possuem <svg>/<i>/<img> filho,
 * sem texto visível, e (para o teste de tap target) com nome
 * acessível (aria-label / title / aria-labelledby).
 */
async function getIconOnlyButtons(page: Page, opts: { requireLabel: boolean }) {
  const candidates = await page
    .locator('button:visible:is(:has(svg), :has(i), :has(img))')
    .all();
  const out: Array<{ locator: Locator; name: string }> = [];
  for (const btn of candidates) {
    const text = ((await btn.textContent()) ?? '').replace(/\s+/g, '').trim();
    if (text !== '') continue; // tem texto visível → não é só-ícone

    const ariaLabel = await btn.getAttribute('aria-label');
    const title = await btn.getAttribute('title');
    const ariaLabelledBy = await btn.getAttribute('aria-labelledby');
    const hasName = !!(ariaLabel || title || ariaLabelledBy);
    if (opts.requireLabel && !hasName) continue;

    out.push({
      locator: btn,
      name: ariaLabel || title || ariaLabelledBy || '(sem nome acessível)',
    });
  }
  return out;
}

const ROUTES: Array<{ path: string; auth: boolean }> = [
  { path: '/auth', auth: false },
  { path: '/orcametas', auth: true },
];

for (const route of ROUTES) {
  test.describe(`Icon-only buttons @ ${route.path}`, () => {
    test.beforeEach(async ({ page }) => {
      if (route.auth) await login(page);
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
    });

    for (const viewport of [
      { name: 'desktop', width: 1280, height: 800 },
      { name: 'mobile', width: 375, height: 667 },
    ]) {
      test(`tap target ≥ ${MIN_TAP_TARGET_SIZE}px (${viewport.name})`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.waitForTimeout(150); // rehidrata layout responsivo

        const buttons = await getIconOnlyButtons(page, { requireLabel: true });
        test.skip(buttons.length === 0, 'Sem botões só-ícone visíveis nesta rota.');

        const failures: string[] = [];
        for (const { locator, name } of buttons) {
          const box = await locator.boundingBox();
          if (!box) continue;
          if (box.width < MIN_TAP_TARGET_SIZE || box.height < MIN_TAP_TARGET_SIZE) {
            failures.push(
              `"${name}" ${Math.round(box.width)}×${Math.round(box.height)}px < ${MIN_TAP_TARGET_SIZE}px`,
            );
          }
        }
        expect(
          failures,
          `Botões só-ícone abaixo do alvo mínimo em ${viewport.name}:\n  - ${failures.join('\n  - ')}`,
        ).toEqual([]);
      });
    }

    test('todo botão só-ícone tem nome acessível', async ({ page }) => {
      const unlabeled = await getIconOnlyButtons(page, { requireLabel: false });
      const missing: string[] = [];
      for (const { locator } of unlabeled) {
        const ariaLabel = await locator.getAttribute('aria-label');
        const title = await locator.getAttribute('title');
        const ariaLabelledBy = await locator.getAttribute('aria-labelledby');
        if (!(ariaLabel || title || ariaLabelledBy)) {
          missing.push(await locator.evaluate((n) => (n as HTMLElement).outerHTML.slice(0, 160)));
        }
      }
      expect(
        missing,
        `Botões só-ícone sem aria-label/title/aria-labelledby:\n  - ${missing.join('\n  - ')}`,
      ).toEqual([]);
    });
  });
}
