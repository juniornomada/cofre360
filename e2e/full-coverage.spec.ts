import { test, expect } from '@playwright/test';

test.describe('Navegação e Cobertura Completa', () => {
  test('Deve carregar todas as rotas principais', async ({ page }) => {
    const routes = [
      '/dashboard',
      '/transactions',
      '/accounts',
      '/cards',
      '/budget',
      '/insights',
      '/chat',
      '/goals'
    ];

    for (const route of routes) {
      await page.goto(route);
      // Wait for content to load (checking for main container or layout)
      await expect(page.locator('body')).toBeVisible();
      console.log(`Rota ${route} carregada com sucesso.`);
    }
  });

  test('Deve interagir com o painel de Insights IA', async ({ page }) => {
    await page.goto('/insights');
    
    // Verificar título
    await expect(page.getByText('AI Insights Benchmark')).toBeVisible();
    
    // Verificar seção de histórico (AITestHistory)
    await expect(page.getByText('Insights IA: Acurácia e Consistência')).toBeVisible();
    
    // Testar botão de configuração de alertas
    const settingsBtn = page.getByRole('button', { name: 'Configurar Alertas' });
    await expect(settingsBtn).toBeEnabled();
    await settingsBtn.click();
    
    // Verificar inputs de limiares
    await expect(page.getByLabel('Mínimo de Acurácia (%)')).toBeVisible();
    await expect(page.getByLabel('Mínimo de Consistência (%)')).toBeVisible();
    
    // Fechar configurações
    await page.getByRole('button', { name: 'Cancelar' }).click();
  });

  test('Responsividade - Mobile View', async ({ page, isMobile }) => {
    if (!isMobile) return;
    
    await page.goto('/dashboard');
    // Verificar se o menu mobile está acessível ou se o layout se ajusta
    await expect(page.locator('nav')).toBeVisible();
  });
});
