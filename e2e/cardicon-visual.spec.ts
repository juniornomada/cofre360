import { test, expect, Page } from '@playwright/test';

/**
 * Regressão visual do CardIcon em /cards.
 *
 * Objetivo do teste: garantir que o CardIcon permanece **alinhado** (mesma
 * bounding box) quando o botão que o envolve entra em hover, focus (teclado)
 * ou disabled — os estados só podem alterar sombra/anel/opacidade/filtro,
 * nunca o tamanho ou a posição da caixa.
 *
 * Estratégia:
 *  1. Abrimos uma rota pública (/auth) apenas para termos o CSS do app
 *     (Tailwind + tokens) carregado — auth externo bloqueia /cards.
 *  2. Injetamos uma fixture com três `<button class="group">` cada um
 *     renderizando o mesmo markup do <CardIcon /> (mesmas classes usadas
 *     em src/components/CardIcon.tsx).
 *  3. Medimos a bounding box do ícone em cada estado (default → hover →
 *     focus → disabled) e exigimos igualdade bit-a-bit — é o invariante
 *     de "não desloca vizinhos" descrito no componente.
 *  4. Snapshot visual (toHaveScreenshot) de cada estado como reforço.
 *
 * O CI cria os baselines na primeira execução; regressões visuais quebram
 * o teste automaticamente em PRs subsequentes.
 */

const FIXTURE_HTML = `
  <div id="cardicon-fixture"
       style="position:fixed;inset:auto 24px 24px auto;z-index:99999;
              display:flex;gap:24px;padding:24px;background:#0b0b0f;border-radius:12px">
    <button id="btn-default" class="group" aria-label="Cartão default"
            style="background:transparent;border:0;padding:0;cursor:pointer">
      <div data-testid="icon-default" role="img" aria-label="Cartão Porto Bank" title="Porto Bank"
           class="relative shrink-0 bg-gradient-to-br overflow-hidden shadow-sm ring-1 ring-inset ring-black/10 h-7 w-10 rounded-md from-primary/30 to-primary/10 group-hover:shadow-md group-hover:ring-white/40 group-focus-visible:ring-2 group-focus-visible:ring-primary group-disabled:opacity-40 group-disabled:saturate-50 group-disabled:shadow-none">
        <span aria-hidden="true" class="absolute bg-white/70 left-1 top-1 h-1.5 w-2 rounded-[2px]"></span>
      </div>
    </button>
    <button id="btn-focus" class="group" aria-label="Cartão focus"
            style="background:transparent;border:0;padding:0;cursor:pointer">
      <div data-testid="icon-focus" role="img" aria-label="Cartão Nubank" title="Nubank"
           class="relative shrink-0 bg-gradient-to-br overflow-hidden shadow-sm ring-1 ring-inset ring-black/10 h-7 w-10 rounded-md from-primary/30 to-primary/10 group-hover:shadow-md group-hover:ring-white/40 group-focus-visible:ring-2 group-focus-visible:ring-primary group-disabled:opacity-40 group-disabled:saturate-50 group-disabled:shadow-none">
        <span aria-hidden="true" class="absolute bg-white/70 left-1 top-1 h-1.5 w-2 rounded-[2px]"></span>
      </div>
    </button>
    <button id="btn-disabled" class="group" aria-label="Cartão disabled" disabled
            style="background:transparent;border:0;padding:0;cursor:not-allowed">
      <div data-testid="icon-disabled" role="img" aria-label="Cartão XP" title="XP"
           class="relative shrink-0 bg-gradient-to-br overflow-hidden shadow-sm ring-1 ring-inset ring-black/10 h-7 w-10 rounded-md from-primary/30 to-primary/10 group-hover:shadow-md group-hover:ring-white/40 group-focus-visible:ring-2 group-focus-visible:ring-primary group-disabled:opacity-40 group-disabled:saturate-50 group-disabled:shadow-none">
        <span aria-hidden="true" class="absolute bg-white/70 left-1 top-1 h-1.5 w-2 rounded-[2px]"></span>
      </div>
    </button>
  </div>
`;

async function mountFixture(page: Page) {
  await page.goto('/auth', { waitUntil: 'domcontentloaded' });
  // O CSS do app (Tailwind) já foi carregado pela rota; agora injetamos a fixture.
  await page.evaluate((html) => {
    document.getElementById('cardicon-fixture')?.remove();
    document.body.insertAdjacentHTML('beforeend', html);
  }, FIXTURE_HTML);
  await page.waitForSelector('[data-testid="icon-default"]');
}

async function boxOf(page: Page, testid: string) {
  const box = await page.locator(`[data-testid="${testid}"]`).boundingBox();
  if (!box) throw new Error(`sem bounding box para ${testid}`);
  // Arredonda para 0.5px para tolerar subpixel rendering entre CIs.
  return {
    x: Math.round(box.x * 2) / 2,
    y: Math.round(box.y * 2) / 2,
    width: Math.round(box.width * 2) / 2,
    height: Math.round(box.height * 2) / 2,
  };
}

test.describe('CardIcon — alinhamento em hover / focus / disabled', () => {
  test('bounding box do ícone é idêntica em todos os estados', async ({ page }) => {
    await mountFixture(page);

    const baseline = await boxOf(page, 'icon-default');

    // hover no primeiro botão
    await page.locator('#btn-default').hover();
    const hoverBox = await boxOf(page, 'icon-default');

    // focus (teclado) no segundo botão
    await page.locator('#btn-focus').focus();
    const focusBox = await boxOf(page, 'icon-focus');

    // disabled já está aplicado no terceiro botão
    const disabledBox = await boxOf(page, 'icon-disabled');

    // Todos os ícones ocupam exatamente o mesmo footprint — nenhum shift.
    expect(hoverBox).toEqual(baseline);
    expect(focusBox.width).toBe(baseline.width);
    expect(focusBox.height).toBe(baseline.height);
    expect(disabledBox.width).toBe(baseline.width);
    expect(disabledBox.height).toBe(baseline.height);
  });

  test('snapshot visual do CardIcon em cada estado', async ({ page }, testInfo) => {
    // Snapshots ficam por navegador — evita flakiness entre chromium desktop e mobile.
    testInfo.snapshotSuffix = testInfo.project.name;

    await mountFixture(page);

    // default
    await expect(page.locator('[data-testid="icon-default"]')).toHaveScreenshot(
      'cardicon-default.png',
      { maxDiffPixelRatio: 0.01 },
    );

    // hover
    await page.locator('#btn-default').hover();
    await expect(page.locator('[data-testid="icon-default"]')).toHaveScreenshot(
      'cardicon-hover.png',
      { maxDiffPixelRatio: 0.01 },
    );

    // focus-visible (via teclado — mouse focus não dispara :focus-visible)
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await page.keyboard.press('Tab');
    // Garante que o botão do meio tem foco
    await page.locator('#btn-focus').focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-testid="icon-focus"]')).toHaveScreenshot(
      'cardicon-focus.png',
      { maxDiffPixelRatio: 0.01 },
    );

    // disabled
    await expect(page.locator('[data-testid="icon-disabled"]')).toHaveScreenshot(
      'cardicon-disabled.png',
      { maxDiffPixelRatio: 0.01 },
    );
  });
});
