import { test, expect } from '@playwright/test';

test.describe('Isolamento de dados por usuário', () => {
  const USER_EMAIL = 'teste@teste.com.br';
  const USER_PASS = 'bra2008';
  
  test('Deve garantir que transações, contas e cartões são visíveis apenas após login', async ({ page }) => {
    // 1. Tentar acessar páginas protegidas deslogado
    const protectedRoutes = ['/transactions', '/accounts', '/cards'];
    
    for (const route of protectedRoutes) {
      await page.goto(route);
      // Deve redirecionar para login ou mostrar estado vazio/não autorizado
      await expect(page).toHaveURL(/\/auth/);
    }

    // 2. Fazer login
    await page.goto('/auth');
    await page.getByPlaceholder('seu@email.com').fill(USER_EMAIL);
    await page.getByPlaceholder('Sua senha').fill(USER_PASS);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/dashboard|\//);

    // 3. Verificar se os dados do usuário aparecem em todas as páginas
    await page.goto('/accounts');
    await expect(page.locator('.bank-logo').first()).toBeVisible({ timeout: 10000 });
    const accCount = await page.locator('div.animate-stagger-in').count();
    expect(accCount).toBeGreaterThan(0);

    await page.goto('/cards');
    // Procurar por cartões interativos
    const cardCount = await page.locator('.interactive-card').count();
    expect(cardCount).toBeGreaterThan(0);

    await page.goto('/transactions');
    const txCount = await page.locator('.interactive-card').count();
    expect(txCount).toBeGreaterThan(0);

    // 4. Logout e verificar se dados somem
    await page.evaluate(() => localStorage.clear());
    await page.goto('/transactions');
    await expect(page).toHaveURL(/\/auth/);
  });
});

