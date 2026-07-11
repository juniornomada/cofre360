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

/**
 * Presets de cor para o corpo do cartão em /cards (src/routes/cards.tsx).
 * O `CardIcon` também é renderizado sobreposto ao gradiente do próprio
 * cartão nas listas — precisamos garantir 3:1 do anel de foco também
 * contra CADA parada de cada gradiente, nos dois temas.
 *
 * Mantido em sincronia manual com CARD_COLOR_PRESETS em cards.tsx: se
 * um preset novo for adicionado lá sem atualizar aqui, o teste
 * `preset list is in sync` falha explicitamente.
 */
const CARD_GRADIENTS: ReadonlyArray<{ label: string; from: string; to: string }> = [
  { label: 'Roxo',         from: 'purple-600', to: 'purple-900' },
  { label: 'Laranja',      from: 'orange-500', to: 'orange-700' },
  { label: 'Preto',        from: 'gray-700',   to: 'gray-900' },
  { label: 'Azul',         from: 'blue-500',   to: 'blue-800' },
  { label: 'Azul Marinho', from: 'blue-900',   to: 'blue-950' },
  { label: 'Ciano',        from: 'cyan-400',   to: 'cyan-600' },
  { label: 'Verde',        from: 'green-500',  to: 'green-800' },
  { label: 'Verde Escuro', from: 'green-800',  to: 'green-950' },
  { label: 'Vermelho',     from: 'red-500',    to: 'red-800' },
  { label: 'Amarelo',      from: 'yellow-400', to: 'yellow-600' },
  { label: 'Rosa',         from: 'pink-400',   to: 'pink-700' },
  { label: 'Índigo',       from: 'indigo-600', to: 'indigo-900' },
  { label: 'Teal',         from: 'teal-500',   to: 'teal-800' },
  { label: 'Dourado',      from: 'yellow-600', to: 'amber-900' },
  { label: 'Prateado',     from: 'slate-300',  to: 'slate-500' },
];

/**
 * Lê todos os stops de cor de uma vez injetando probes com
 * `background: var(--color-<name>)` — Tailwind v4 expõe cada cor do
 * default theme como uma CSS custom property em :root, então o teste
 * pega os RGBs efetivos sem depender do classe-scan do compilador.
 */
async function readGradientStops(page: Page, stops: readonly string[]) {
  await page.evaluate((names) => {
    const host = document.createElement('div');
    host.id = 'a11y-grad-probes';
    host.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
    for (const n of names) {
      const d = document.createElement('div');
      d.id = `probe-color-${n}`;
      d.style.background = `var(--color-${n})`;
      host.appendChild(d);
    }
    document.getElementById('a11y-grad-probes')?.remove();
    document.body.appendChild(host);
  }, stops);

  return page.evaluate((names) => {
    const out: Record<string, [number, number, number]> = {};
    for (const n of names) {
      const s = getComputedStyle(document.querySelector(`#probe-color-${n}`)!).backgroundColor;
      const m = s.match(/\d+(\.\d+)?/g);
      if (!m || m.length < 3) throw new Error(`sem rgb para --color-${n}: ${s}`);
      out[n] = [Number(m[0]), Number(m[1]), Number(m[2])];
    }
    return out;
  }, stops);
}

const haloOn = (surface: RGB): RGB => blend(BLACK, HALO_ALPHA, surface);

for (const theme of ['light', 'dark'] as const) {
  test.describe(`CardIcon — focus ring contrast (WCAG 2.2 SC 1.4.11) — ${theme}`, () => {
    test(`halo duplo ≥ 3:1 sobre background, card e gradiente do ícone (${theme})`, async ({ page }) => {
      await page.goto('/auth', { waitUntil: 'domcontentloaded' });
      await setTheme(page, theme);
      const { bg, card, primary } = await readTokens(page);

      const gradOnBg: RGB = blend(primary, GRAD_FROM_ALPHA, bg);
      const gradOnBgTo: RGB = blend(primary, GRAD_TO_ALPHA, bg);
      const gradOnCard: RGB = blend(primary, GRAD_FROM_ALPHA, card);
      const gradOnCardTo: RGB = blend(primary, GRAD_TO_ALPHA, card);

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
        expect
          .soft(contrast(halo, s.color), `[${theme}] halo vs ${s.name}`)
          .toBeGreaterThanOrEqual(3);
        expect
          .soft(contrast(WHITE, halo), `[${theme}] white core vs halo on ${s.name}`)
          .toBeGreaterThanOrEqual(3);
      }
    });

    test(`halo duplo ≥ 3:1 sobre cada gradiente de cartão em /cards (${theme})`, async ({ page }) => {
      await page.goto('/auth', { waitUntil: 'domcontentloaded' });
      await setTheme(page, theme);

      const stops = Array.from(new Set(CARD_GRADIENTS.flatMap((g) => [g.from, g.to])));
      const rgb = await readGradientStops(page, stops);

      for (const g of CARD_GRADIENTS) {
        // O corpo do cartão em cards.tsx (linha 1105) usa `bg-gradient-to-br
        // from-<from> to-<to>` a 100% opacidade — os únicos pixels adjacentes
        // ao anel de foco são as duas paradas de cor puras. Amostramos ambas
        // + o ponto médio (aproximação linear do gradiente na diagonal).
        const from = rgb[g.from];
        const to = rgb[g.to];
        const mid: RGB = [
          (from[0] + to[0]) / 2,
          (from[1] + to[1]) / 2,
          (from[2] + to[2]) / 2,
        ];

        for (const [label, surface] of [
          [`${g.label} · from ${g.from}`, from],
          [`${g.label} · mid`, mid],
          [`${g.label} · to ${g.to}`, to],
        ] as const) {
          const halo = haloOn(surface as RGB);
          expect
            .soft(
              contrast(halo, surface as RGB),
              `[${theme}] halo vs card gradient ${label} = ${contrast(halo, surface as RGB).toFixed(2)}:1`,
            )
            .toBeGreaterThanOrEqual(3);
          expect
            .soft(
              contrast(WHITE, halo),
              `[${theme}] white core vs halo on ${label} = ${contrast(WHITE, halo).toFixed(2)}:1`,
            )
            .toBeGreaterThanOrEqual(3);
        }
      }
    });

    test(`preset list is in sync with src/routes/cards.tsx (${theme})`, async ({ page }) => {
      // Detecta drift silencioso: se cards.tsx ganhar/perder um preset e
      // este teste não for atualizado, os novos gradientes não seriam
      // validados. Baixa o arquivo pelo dev server e confere a contagem.
      const res = await page.request.get('/src/routes/cards.tsx');
      expect(res.ok()).toBe(true);
      const src = await res.text();
      const matches = src.match(/value:\s*"from-[a-z]+-\d+\s+to-[a-z]+-\d+"/g) ?? [];
      expect(
        matches.length,
        `CARD_GRADIENTS neste spec tem ${CARD_GRADIENTS.length} presets, mas cards.tsx tem ${matches.length}. Sincronize a lista.`,
      ).toBe(CARD_GRADIENTS.length);
    });
  });
}
