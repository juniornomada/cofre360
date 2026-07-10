import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

/**
 * Auditoria automatizada de acessibilidade (axe-core) para as telas
 * de Cartões (/cards) e Lembretes (/reminders).
 *
 * Cobre regras WCAG 2.0/2.1 A e AA. Falha o build caso surjam violações
 * como falta de aria-label em ícones/botões, contraste insuficiente,
 * duplicação de IDs ARIA, etc.
 */

const SCREENS = [
  { name: 'Cartões', path: '/cards' },
  { name: 'Lembretes', path: '/reminders' },
] as const;

for (const screen of SCREENS) {
  test.describe(`Acessibilidade — ${screen.name}`, () => {
    test(`não deve ter violações axe-core em ${screen.path}`, async ({ page }) => {
      await page.goto(screen.path);
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      if (results.violations.length > 0) {
        console.log(
          `Violações em ${screen.path}:`,
          JSON.stringify(
            results.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
              help: v.help,
              nodes: v.nodes.map((n) => n.target),
            })),
            null,
            2,
          ),
        );
      }

      expect(results.violations).toEqual([]);
    });

    test(`ícones de cartão devem expor nome acessível em ${screen.path}`, async ({ page }) => {
      await page.goto(screen.path);
      await page.waitForLoadState('networkidle');

      // CardIcon renderiza role="img" com aria-label="Cartão {nome}" ou "Cartão".
      const icons = page.locator('[role="img"]');
      const count = await icons.count();

      for (let i = 0; i < count; i++) {
        const label = await icons.nth(i).getAttribute('aria-label');
        expect(label, `role="img" #${i} sem aria-label em ${screen.path}`).toBeTruthy();
      }
    });
  });
}
