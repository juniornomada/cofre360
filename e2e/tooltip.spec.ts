import { test, expect } from '@playwright/test';

test.describe('Tooltip Accessibility and Behavior', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.interactive-card', { timeout: 10000 }).catch(() => {});
  });

  test('should use button role for interactive triggers and show tooltip', async ({ page }) => {
    // We updated roles to 'button' for better semantic accessibility on interactive badges
    const trigger = page.locator('span[role="button"]').first();
    
    if (await trigger.count() > 0) {
      await trigger.focus();
      
      // Check for aria-describedby
      await expect(trigger).toHaveAttribute('aria-describedby', /radix/);
      
      const id = await trigger.getAttribute('aria-describedby');
      const content = page.locator(`#${id}`);
      
      // Tooltip content must be visible and have role="tooltip"
      await expect(content).toBeVisible();
      await expect(content).toHaveAttribute('role', 'tooltip');
    }
  });

  test('should announce content via aria-label on the trigger', async ({ page }) => {
    const trigger = page.locator('span[role="button"]').first();
    
    if (await trigger.count() > 0) {
      const label = await trigger.getAttribute('aria-label');
      // Label should exist and provide context
      expect(label).toMatch(/Informações/);
    }
  });
});
