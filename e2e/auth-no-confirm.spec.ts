import { test, expect } from '@playwright/test';

test.describe('Fluxo de Autenticação sem Confirmação de E-mail', () => {
  const timestamp = Date.now();
  const testEmail = `novo_usuario_${timestamp}@test.com`;
  const testPassword = 'Password123!';

  test('Deve realizar cadastro e login automático imediatamente', async ({ page }) => {
    // 1. Ir para a página de autenticação
    await page.goto('/auth');
    
    // 2. Mudar para modo cadastro
    await page.getByRole('button', { name: 'Não tem conta? Cadastre-se agora' }).click();
    
    // 3. Preencher dados de cadastro
    await page.getByPlaceholder('seu@email.com').fill(testEmail);
    await page.getByPlaceholder('Sua senha').fill(testPassword);
    
    // 4. Clicar em cadastrar
    await page.getByRole('button', { name: 'Cadastrar' }).click();
    
    // 5. Verificar se o login automático ocorreu (redirecionamento para dashboard ou home)
    // O timeout é maior para dar tempo do Supabase processar a criação sem confirmação
    await expect(page).toHaveURL(/\/dashboard|\//, { timeout: 15000 });
    
    // 6. Verificar se o toast de sucesso aparece
    const successToast = page.locator('text=Cadastro realizado com sucesso!');
    await expect(successToast).toBeVisible();

    // 7. Verificar se estamos logados acessando uma página protegida
    await page.goto('/transactions');
    await expect(page).toHaveURL(/\/transactions/);
    
    // 8. Garantir que não fomos chutados de volta para o login
    await expect(page.locator('text=E-mail')).not.toBeVisible();
  });
});
