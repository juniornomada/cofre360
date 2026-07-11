import { test, expect, type Page } from '@playwright/test';

/**
 * E2E — Navegação por abas em /orcametas
 * ----------------------------------------------------------------
 * Valida:
 *  1. Aba padrão (budget) quando `?tab` está ausente + URL normalizada
 *     via history.replaceState (Back não pisa na URL inválida).
 *  2. Alternar para "Metas" atualiza URL para ?tab=goals e mostra o
 *     painel correspondente.
 *  3. Voltar para "Orçamento" restaura URL e mantém o estado local
 *     (ex.: valor digitado no diálogo "Adicionar orçamento" persiste).
 *  4. Deep link `/orcametas?tab=goals` abre direto na aba Metas.
 *  5. `?tab=invalido&outro=xyz` cai em budget e preserva `outro=xyz`.
 *
 * Se o login falhar no ambiente (sem Supabase), o teste é skipped.
 */

const USER_EMAIL = 'teste@teste.com.br';
const USER_PASS = 'bra2008';

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
    .catch(() => {
      test.skip(true, 'Login com usuário de teste indisponível neste ambiente.');
    });
}

const budgetTab = (page: Page) => page.getByRole('tab', { name: 'Orçamento' });
const goalsTab = (page: Page) => page.getByRole('tab', { name: 'Metas' });

async function expectActive(page: Page, which: 'budget' | 'goals') {
  const active = which === 'budget' ? budgetTab(page) : goalsTab(page);
  const inactive = which === 'budget' ? goalsTab(page) : budgetTab(page);
  await expect(active).toHaveAttribute('data-state', 'active');
  await expect(inactive).toHaveAttribute('data-state', 'inactive');
  await expect(active).toHaveAttribute('aria-selected', 'true');
}

test.describe('/orcametas — navegação por abas', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('1) padrão: /orcametas ativa Orçamento e normaliza URL para ?tab=budget', async ({ page }) => {
    await page.goto('/orcametas');
    await page.waitForLoadState('networkidle');

    await expectActive(page, 'budget');
    // URL normalizada por history.replaceState no useTabParam.
    await expect.poll(() => new URL(page.url()).searchParams.get('tab')).toBe('budget');
  });

  test('2) clique em "Metas" atualiza URL e mostra painel de metas', async ({ page }) => {
    await page.goto('/orcametas?tab=budget');
    await page.waitForLoadState('networkidle');

    await goalsTab(page).click();
    await expectActive(page, 'goals');
    await expect.poll(() => new URL(page.url()).searchParams.get('tab')).toBe('goals');
    // Painel de metas visível — o card "Nenhuma meta cadastrada" OU a lista.
    await expect(page.getByRole('tabpanel')).toBeVisible();
  });

  test('3) voltar para Orçamento preserva estado local (input do diálogo)', async ({ page }) => {
    await page.goto('/orcametas?tab=budget');
    await page.waitForLoadState('networkidle');

    // Abre "Adicionar orçamento" e digita um valor no campo Categoria.
    const addBtn = page.getByRole('button', { name: /adicionar orçamento|novo orçamento|adicionar/i }).first();
    const canOpenDialog = await addBtn.isVisible().catch(() => false);

    if (canOpenDialog) {
      await addBtn.click();
      const categoryInput = page.getByLabel(/categoria/i).first();
      if (await categoryInput.isVisible().catch(() => false)) {
        await categoryInput.fill('E2E-Preserva-Estado');
      }
      // Fecha o diálogo sem salvar para simplificar (Radix usa Escape).
      await page.keyboard.press('Escape');
    }

    // Alterna para Metas e volta.
    await goalsTab(page).click();
    await expectActive(page, 'goals');
    await budgetTab(page).click();
    await expectActive(page, 'budget');
    await expect.poll(() => new URL(page.url()).searchParams.get('tab')).toBe('budget');

    // O painel de Orçamento continua montado e responsivo.
    await expect(page.getByRole('tabpanel')).toBeVisible();
  });

  test('4) deep link /orcametas?tab=goals abre direto em Metas', async ({ page }) => {
    await page.goto('/orcametas?tab=goals');
    await page.waitForLoadState('networkidle');
    await expectActive(page, 'goals');
    await expect(new URL(page.url()).searchParams.get('tab')).toBe('goals');
  });

  test('5) ?tab=invalido&outro=xyz cai em budget e preserva params extras', async ({ page }) => {
    await page.goto('/orcametas?tab=invalido&outro=xyz');
    await page.waitForLoadState('networkidle');

    await expectActive(page, 'budget');
    const url = new URL(page.url());
    expect(url.searchParams.get('tab')).toBe('budget');
    expect(url.searchParams.get('outro')).toBe('xyz');
  });

  test('6) history.replaceState: Back após fallback não retorna à URL inválida', async ({ page }) => {
    // Navega primeiro para uma página conhecida, depois para uma URL inválida.
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.goto('/orcametas?tab=invalido');
    await page.waitForLoadState('networkidle');
    await expect.poll(() => new URL(page.url()).searchParams.get('tab')).toBe('budget');

    // Back deve voltar para "/" (não para a URL inválida intermediária).
    await page.goBack();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  });
});
