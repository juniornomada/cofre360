import { test, expect, Page } from '@playwright/test';

/**
 * WCAG 2.2 SC 1.4.11 (Non-text Contrast) — focus indicator do CardIcon
 * precisa manter ao menos 3:1 vs qualquer superfície adjacente, em ambos
 * os temas (claro e escuro) e sobre o gradiente do próprio cartão.
 *
 * O anel do CardIcon é composto (inset box-shadow) por três camadas:
 *   dark halo (rgba(0,0,0,0.85)) → white core (#fff) → dark halo
 *
 * Para atender 1.4.11 basta que:
 *   1) o halo externo tenha ≥3:1 vs a superfície que o cerca
 *      (background da página OU gradiente do cartão);
 *   2) o núcleo branco tenha ≥3:1 vs o halo (garante que a "banda" branca
 *      permanece visível independentemente do fundo).
 *
 * O teste NÃO amostra pixels de screenshot: lê os tokens semânticos
 * (--background, --card, --primary) via getComputedStyle, replica em JS
 * a mesma composição alpha usada pelo CSS (from-primary/30 to-primary/10
 * em CardIcon.tsx) e aplica a fórmula de contraste WCAG 2.x. Isso deixa
 * o teste determinístico e independente de renderização.
 */

type RGB = [number, number, number];

const FIXTURE_PROBES = `
  <div id="a11y-probes" style="position:fixed;left:-9999px;top:-9999px">
    <div id="probe-bg"      style="background:var(--background)"></div>
    <div id="probe-card"    style="background:var(--card)"></div>
    <div id="probe-primary" style="background:var(--primary)"></div>
  </div>
`;

async function readTokens(page: Page) {
  await page.evaluate((html) => {
    document.getElementById('a11y-probes')?.remove();
    document.body.insertAdjacentHTML('beforeend', html);
  }, FIXTURE_PROBES);

  return page.evaluate(() => {
    const rgb = (sel: string) => {
      const s = getComputedStyle(document.querySelector(sel)!).backgroundColor;
      const m = s.match(/\d+(\.\d+)?/g);
      if (!m) throw new Error(`sem rgb em ${sel}: ${s}`);
      return [Number(m[0]), Number(m[1]), Number(m[2])] as [number, number, number];
    };
    return {
      bg: rgb('#probe-bg'),
      card: rgb('#probe-card'),
      primary: rgb('#probe-primary'),
    };
  });
}

function blend(fg: RGB, alpha: number, bg: RGB): RGB {
  return [
    fg[0] * alpha + bg[0] * (1 - alpha),
    fg[1] * alpha + bg[1] * (1 - alpha),
    fg[2] * alpha + bg[2] * (1 - alpha),
  ];
}

function relLum([r, g, b]: RGB): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: RGB, b: RGB): number {
  const L1 = relLum(a);
  const L2 = relLum(b);
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => {
    const c = document.documentElement.classList;
    c.remove('light', 'dark');
    c.add(t);
  }, theme);
}

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
const HALO_ALPHA = 0.85; // rgba(0,0,0,0.85) — mesmo valor de src/components/CardIcon.tsx e styles.css
const GRAD_FROM_ALPHA = 0.30; // from-primary/30
const GRAD_TO_ALPHA = 0.10;   // to-primary/10

for (const theme of ['light', 'dark'] as const) {
  test.describe(`CardIcon — focus ring contrast (WCAG 2.2 SC 1.4.11) — ${theme}`, () => {
    test(`halo externo ≥ 3:1 vs background e gradiente (${theme})`, async ({ page }) => {
      await page.goto('/auth', { waitUntil: 'domcontentloaded' });
      await setTheme(page, theme);
      const { bg, card, primary } = await readTokens(page);

      // Superfícies onde o CardIcon pode aparecer:
      //  - background da página (lista de cartões, lembretes, home)
      //  - card (dentro de uma superfície .bg-card)
      //  - gradiente do próprio ícone: from-primary/30 → to-primary/10 sobre a superfície
      const gradOnBg: RGB = blend(primary, GRAD_FROM_ALPHA, bg);
      const gradOnBgTo: RGB = blend(primary, GRAD_TO_ALPHA, bg);
      const gradOnCard: RGB = blend(primary, GRAD_FROM_ALPHA, card);
      const gradOnCardTo: RGB = blend(primary, GRAD_TO_ALPHA, card);

      // Cor efetiva do halo externo composto sobre cada superfície.
      const haloOn = (surface: RGB) => blend(BLACK, HALO_ALPHA, surface);

      const surfaces: Array<{ name: string; color: RGB }> = [
        { name: 'page background', color: bg },
        { name: 'card surface', color: card },
        { name: 'icon gradient from-primary/30 (on bg)', color: gradOnBg },
        { name: 'icon gradient to-primary/10 (on bg)', color: gradOnBgTo },
        { name: 'icon gradient from-primary/30 (on card)', color: gradOnCard },
        { name: 'icon gradient to-primary/10 (on card)', color: gradOnCardTo },
      ];

      for (const s of surfaces) {
        const halo = haloOn(s.color);
        const cHaloVsSurface = contrast(halo, s.color);
        const cWhiteVsHalo = contrast(WHITE, halo);

        expect
          .soft(
            cHaloVsSurface,
            `[${theme}] halo externo vs ${s.name} = ${cHaloVsSurface.toFixed(2)}:1 (WCAG mín 3:1)`,
          )
          .toBeGreaterThanOrEqual(3);

        expect
          .soft(
            cWhiteVsHalo,
            `[${theme}] núcleo branco do anel vs halo (sobre ${s.name}) = ${cWhiteVsHalo.toFixed(2)}:1 (WCAG mín 3:1)`,
          )
          .toBeGreaterThanOrEqual(3);
      }
    });
  });
}
