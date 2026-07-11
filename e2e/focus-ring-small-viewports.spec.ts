import { test, expect, type Page } from '@playwright/test';

/**
 * WCAG 2.2 SC 1.4.11 + SC 2.3.3 — Auditoria do anel de foco em telas
 * pequenas (375, 390, 428) com `prefers-reduced-motion: reduce`.
 *
 * Este spec complementa `cardicon-focus-contrast.spec.ts` cobrindo três
 * riscos que só aparecem em runtime:
 *   1. Anel de foco visualmente cortado por ancestral com overflow
 *      hidden / clip (regressão comum em cabeçalhos sticky).
 *   2. Anel saindo da viewport quando o botão está nas bordas.
 *   3. Interação com `prefers-reduced-motion` — o anel não pode depender
 *      de transição animada para aparecer.
 */

const USER_EMAIL = 'teste@teste.com.br';
const USER_PASS = 'bra2008';

const VIEWPORTS = [
  { name: 'iPhone SE 375', width: 375, height: 667 },
  { name: 'iPhone 12 390', width: 390, height: 844 },
  { name: 'iPhone Pro Max 428', width: 428, height: 926 },
] as const;

async function login(page: Page) {
  await page.goto('/auth');
  const email = page.getByPlaceholder('seu@email.com');
  if (!(await email.isVisible().catch(() => false))) {
    test.skip(true, '/auth indisponível.');
  }
  await email.fill(USER_EMAIL);
  await page.getByPlaceholder('Sua senha').fill(USER_PASS);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page
    .waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 15_000 })
    .catch(() => test.skip(true, 'Login indisponível.'));
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => {
    const c = document.documentElement.classList;
    c.remove('light', 'dark');
    c.add(t);
  }, theme);
}

/**
 * Verifica que, após focar o elemento, o box gerado (incluindo o anel
 * de foco) está inteiramente contido na viewport E não é ocultado por
 * clip/overflow de nenhum ancestral. Mede o "outer bounds" derivando o
 * box-shadow computado (inset ou não) do próprio elemento.
 */
async function assertFocusRingVisible(
  page: Page,
  selector: string,
  viewport: { width: number; height: number },
  label: string,
) {
  const handle = page.locator(selector).first();
  await handle.scrollIntoViewIfNeeded();
  await handle.focus();

  const info = await handle.evaluate((el) => {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    // Extrai o maior spread + blur do box-shadow para calcular o footprint.
    // Aceita múltiplas camadas separadas por "),", que é o padrão do anel.
    const parts = cs.boxShadow.split(/,(?![^()]*\))/);
    let extra = 0;
    for (const p of parts) {
      const nums = p.match(/-?\d+(?:\.\d+)?px/g) ?? [];
      // offsetX offsetY blur spread — pegamos blur (idx 2) + spread (idx 3)
      const blur = nums[2] ? Math.abs(parseFloat(nums[2])) : 0;
      const spread = nums[3] ? Math.abs(parseFloat(nums[3])) : 0;
      extra = Math.max(extra, blur + spread);
    }
    // outline também conta como anel visível.
    const outlineW = parseFloat(cs.outlineWidth) || 0;
    const outlineOff = parseFloat(cs.outlineOffset) || 0;
    extra = Math.max(extra, outlineW + Math.max(outlineOff, 0));

    // Amostra corners: se algum for coberto por elemento com clip-path
    // ou overflow-hidden fora do elemento, elementFromPoint retorna algo
    // que NÃO é o próprio botão nem descendente dele.
    const corners = [
      [rect.left + 2, rect.top + 2],
      [rect.right - 2, rect.top + 2],
      [rect.left + 2, rect.bottom - 2],
      [rect.right - 2, rect.bottom - 2],
    ] as const;
    const covered: string[] = [];
    for (const [x, y] of corners) {
      const hit = document.elementFromPoint(x, y);
      if (!hit) continue;
      if (hit !== el && !el.contains(hit)) {
        covered.push(`(${Math.round(x)},${Math.round(y)}) → ${hit.tagName.toLowerCase()}`);
      }
    }
    return { rect, extra, covered, boxShadow: cs.boxShadow, outline: cs.outline };
  });

  const outer = {
    left: info.rect.left - info.extra,
    top: info.rect.top - info.extra,
    right: info.rect.right + info.extra,
    bottom: info.rect.bottom + info.extra,
  };

  // 1) O anel não pode ser recortado horizontalmente pela viewport.
  expect
    .soft(outer.left, `${label}: anel corta borda esquerda (left=${outer.left.toFixed(1)}px)`)
    .toBeGreaterThanOrEqual(-1);
  expect
    .soft(outer.right, `${label}: anel corta borda direita (right=${outer.right.toFixed(1)}px, vw=${viewport.width})`)
    .toBeLessThanOrEqual(viewport.width + 1);

  // 2) Nenhum canto pode estar coberto por overlay/clip externo.
  expect
    .soft(info.covered, `${label}: cantos cobertos: ${info.covered.join(' | ')}`)
    .toEqual([]);

  // 3) Precisa haver anel visível — box-shadow OU outline não-nulos.
  const hasRing = info.boxShadow !== 'none' || (info.outline && !info.outline.startsWith('0px'));
  expect(hasRing, `${label}: sem anel de foco visível (box-shadow=${info.boxShadow}, outline=${info.outline})`).toBe(true);
}

for (const vp of VIEWPORTS) {
  test.describe(`Focus ring @ ${vp.name} · reduced-motion`, () => {
    test.use({
      viewport: { width: vp.width, height: vp.height },
      reducedMotion: 'reduce',
    });

    test.beforeEach(async ({ page }) => {
      await login(page);
      await page.goto('/');
      await page.waitForLoadState('networkidle');
    });

    for (const theme of ['dark', 'light'] as const) {
      test(`anel visível em botões da Home (${theme})`, async ({ page }) => {
        await setTheme(page, theme);

        // ThemeToggle (aria-label dinâmico "Mudar para tema claro/escuro"
        // ou fallback "Alternar tema" enquanto não hidrata).
        await assertFocusRingVisible(
          page,
          'button[aria-label^="Mudar para tema"], button[aria-label="Alternar tema"]',
          vp,
          `${vp.name} · ${theme} · ThemeToggle`,
        );

        // Setas de navegação de fatura na Home.
        await assertFocusRingVisible(
          page,
          'button[aria-label="Fatura anterior"]',
          vp,
          `${vp.name} · ${theme} · Fatura anterior`,
        );
        await assertFocusRingVisible(
          page,
          'button[aria-label="Próxima fatura"]',
          vp,
          `${vp.name} · ${theme} · Próxima fatura`,
        );
      });
    }

    test('prefers-reduced-motion respeitado', async ({ page }) => {
      const reduced = await page.evaluate(
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      );
      expect(reduced).toBe(true);

      // O anel não pode depender de transição para existir: força foco
      // e mede imediatamente (sem esperar transição concluir).
      const btn = page.locator('button[aria-label="Fatura anterior"]').first();
      await btn.focus();
      const shadow = await btn.evaluate((el) => getComputedStyle(el).boxShadow);
      const outline = await btn.evaluate((el) => getComputedStyle(el).outline);
      expect(
        shadow !== 'none' || !outline.startsWith('0px'),
        `anel ausente com reduced-motion (shadow=${shadow}, outline=${outline})`,
      ).toBe(true);
    });
  });
}
