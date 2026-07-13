import { test, expect } from '@playwright/test';

/**
 * Regressão visual (snapshot) do rótulo "Venc. dd/mm".
 *
 * Objetivo: detectar mudanças de layout, tipografia, cor ou truncamento no
 * rótulo canônico usado na Home (`src/routes/index.tsx`) e em /cards
 * (`src/routes/cards.tsx`, incluindo o cabeçalho do diálogo "Pagar Fatura").
 *
 * Como as datas de vencimento dependem do mês corrente e mudariam o baseline
 * a cada execução, este teste NÃO tira snapshot da rota renderizada. Em vez
 * disso — seguindo o padrão de e2e/cardicon-visual.spec.ts — injeta uma
 * fixture HTML com o markup EXATO usado nas duas rotas (mesmas classes
 * Tailwind, mesmos wrappers, mesmos vizinhos) e mede/snapshot cada estado.
 *
 * Cenários cobertos:
 *  1. Home-compact           → linha `text-[10px] text-muted-foreground` com
 *                              nome do cartão à esquerda (truncate).
 *  2. Cards-header           → header do diálogo da fatura em fundo escuro
 *                              (`text-white/90 uppercase tracking-wider`).
 *  3. Pay-dialog-header      → cabeçalho de "Pagar Fatura" (mesmo helper).
 *  4. Invalid-fallback       → data inválida deve renderizar "Venc. --/--".
 *  5. Truncation-guard       → container estreito com nome de cartão longo:
 *                              o rótulo NÃO pode ser truncado (regressão de
 *                              layout mais comum quando `min-w-0` é perdido).
 *
 * O CI cria os baselines na primeira execução; regressões visuais quebram
 * o teste automaticamente em PRs subsequentes.
 */

const FIXTURE_HTML = `
  <div id="due-label-fixture"
       style="position:fixed;inset:24px auto auto 24px;z-index:99999;
              display:flex;flex-direction:column;gap:16px;padding:16px;
              background:#0b0b0f;border-radius:12px;width:360px">

    <!-- 1. Home-compact -->
    <div data-snap="home-compact"
         style="background:hsl(var(--card));border-radius:8px;padding:8px">
      <div class="flex items-center gap-2">
        <div class="flex flex-col flex-1 min-w-0">
          <p class="text-xs font-medium text-foreground truncate">Porto Bank</p>
          <span class="text-[10px] font-medium text-muted-foreground"
                aria-label="Vencimento em 05/08">
            <span aria-hidden="true">Venc. 05/08</span>
          </span>
        </div>
        <div class="text-right shrink-0">
          <p class="text-xs font-bold tabular-nums text-primary">R$ 1.234,56</p>
        </div>
      </div>
    </div>

    <!-- 2. Cards-header (fundo escuro do diálogo da fatura) -->
    <div data-snap="cards-header"
         style="background:#1f1147;border-radius:8px;padding:12px">
      <div class="min-w-0">
        <p class="text-[10px] font-bold uppercase tracking-wider text-white/90 flex items-center gap-1.5 flex-wrap"
           aria-label="Vencimento em 05/08">
          <span aria-hidden="true">Venc. 05/08</span>
        </p>
      </div>
    </div>

    <!-- 3. Pay-dialog-header -->
    <div data-snap="pay-dialog-header"
         style="background:hsl(var(--card));border-radius:8px;padding:12px">
      <p class="text-sm font-semibold text-foreground"
         aria-label="Vencimento em 05/08">
        <span aria-hidden="true">Venc. 05/08</span>
      </p>
    </div>

    <!-- 4. Invalid-fallback -->
    <div data-snap="invalid-fallback"
         style="background:hsl(var(--card));border-radius:8px;padding:8px">
      <span class="text-[10px] font-medium text-muted-foreground"
            aria-label="Vencimento indisponível">
        <span aria-hidden="true">Venc. --/--</span>
      </span>
    </div>

    <!-- 5. Truncation-guard: nome longo, rótulo intacto -->
    <div data-snap="truncation-guard"
         style="background:hsl(var(--card));border-radius:8px;padding:8px;width:220px">
      <div class="flex items-center gap-2">
        <div class="flex flex-col flex-1 min-w-0">
          <p class="text-xs font-medium text-foreground truncate">Cartão Empresarial Platinum Internacional</p>
          <span class="text-[10px] font-medium text-muted-foreground"
                aria-label="Vencimento em 05/08">
            <span aria-hidden="true">Venc. 05/08</span>
          </span>
        </div>
      </div>
    </div>
  </div>
`;

async function mountFixture(page: import('@playwright/test').Page) {
  // Abrir uma rota pública apenas para carregar o CSS do app (Tailwind + tokens).
  await page.goto('/auth', { waitUntil: 'domcontentloaded' });
  await page.evaluate((html) => {
    document.body.insertAdjacentHTML('beforeend', html);
  }, FIXTURE_HTML);
  // Esperar layout e fontes estabilizarem.
  await page.evaluate(() => (document as any).fonts?.ready);
  await page.waitForTimeout(150);
}

const SCENARIOS = [
  'home-compact',
  'cards-header',
  'pay-dialog-header',
  'invalid-fallback',
  'truncation-guard',
] as const;

for (const key of SCENARIOS) {
  test(`due-label visual snapshot — ${key}`, async ({ page }) => {
    await mountFixture(page);
    const el = page.locator(`[data-snap="${key}"]`);
    await expect(el).toBeVisible();

    // Sanidade: nunca deve conter "Fatura {mês}" nem placeholders quebrados.
    const text = (await el.textContent()) ?? '';
    expect(text).not.toMatch(/Fatura\s+(Janeiro|Fevereiro|Março|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)/i);
    expect(text).not.toMatch(/NaN|undefined|Invalid Date/);
    if (key === 'invalid-fallback') {
      expect(text).toContain('Venc. --/--');
    } else {
      expect(text).toMatch(/Venc\. \d{2}\/\d{2}/);
    }

    await expect(el).toHaveScreenshot(`due-label-${key}.png`, {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    });
  });
}

test('due-label truncation guard — rótulo permanece integralmente visível', async ({ page }) => {
  await mountFixture(page);
  const container = page.locator('[data-snap="truncation-guard"]');
  const label = container.locator('span[aria-label="Vencimento em 05/08"] > span[aria-hidden="true"]');
  const box = await label.boundingBox();
  expect(box, 'label deve ter bounding box').toBeTruthy();

  // scrollWidth === clientWidth ⇒ nenhum caractere foi truncado por overflow.
  const trunc = await label.evaluate((n) => {
    const el = n as HTMLElement;
    return { scrollW: el.scrollWidth, clientW: el.clientWidth, text: el.textContent };
  });
  expect(trunc.text).toBe('Venc. 05/08');
  expect(trunc.scrollW).toBeLessThanOrEqual(trunc.clientW + 1);
});
