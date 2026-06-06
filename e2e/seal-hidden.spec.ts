import { test, expect } from '@playwright/test';

test.describe('Ocultação de Selo (Seal Hiding)', () => {
  test('deve garantir que o selo Lovable está oculto na página de teste', async ({ page }) => {
    // Navega para a rota de teste que contém os elementos do selo
    await page.goto('/test-seal');

    // Seletores definidos no SealVerifier e styles.css
    const selectors = [
      '.lovable-badge',
      '#lovable-badge',
      'a[href*="lovable.dev"]'
    ];

    for (const selector of selectors) {
      const element = page.locator(selector);
      
      // Verifica se o elemento está oculto ou não presente
      // Devido ao CSS (display: none !important), o Playwright deve considerá-lo não visível
      const isVisible = await element.isVisible();
      expect(isVisible).toBe(false);
      
      // Também verificamos se ele tem propriedades de ocultação via computed style se ainda estiver no DOM
      if (await element.count() > 0) {
        const display = await element.evaluate(el => window.getComputedStyle(el).display);
        expect(display).toBe('none');
      }
    }
  });

  test('deve garantir que o selo não está presente na home', async ({ page }) => {
    await page.goto('/');
    
    const selectors = [
      '.lovable-badge',
      '#lovable-badge',
      'a[href*="lovable.dev"]',
      'iframe[src*="lovable.dev"]'
    ];

    for (const selector of selectors) {
      const isVisible = await page.locator(selector).isVisible();
      expect(isVisible).toBe(false);
    }
  });
});
