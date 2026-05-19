import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

test.describe('Accessibility Audit', () => {
  test('should not have any automatically detectable accessibility violations', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the application to be stable
    await page.waitForLoadState('networkidle');

    // Audit the initial state
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('tooltips should not have accessibility violations when open', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const trigger = page.locator('[role="note"], [tabindex="0"]').first();
    
    if (await trigger.count() > 0) {
      await trigger.focus();
      // Wait for tooltip to be visible
      const describedBy = await trigger.getAttribute('aria-describedby');
      if (describedBy) {
          await expect(page.locator(`#${describedBy}`)).toBeVisible();
      }

      // Audit with tooltip open
      const accessibilityScanResults = await new AxeBuilder({ page })
        .include('[role="tooltip"]')
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    }
  });
});
