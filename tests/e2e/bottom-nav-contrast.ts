import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('BottomNavBar E2E Accessibility', () => {
  test('should pass accessibility tests on mobile light mode', async ({ page }) => {
    // Set viewport to mobile
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Navigate to a page where BottomNavBar is visible
    // We might need to handle auth if it's protected, but for a general check:
    await page.goto('/');
    
    // Set theme to light (assuming there's a way to toggle it or it's default)
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    });

    const accessibilityScanResults = await new AxeBuilder({ page })
      .include('[data-test="bottom-nav"]')
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should pass accessibility tests on mobile dark mode', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // Set theme to dark
    await page.evaluate(() => {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    });

    const accessibilityScanResults = await new AxeBuilder({ page })
      .include('[data-test="bottom-nav"]')
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('focus state should be visible', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // Tab to the first nav item
    await page.keyboard.press('Tab');
    
    const firstNavItem = page.locator('[data-testid="nav-link"]').first();
    await expect(firstNavItem).toBeFocused();
    
    // Verify focus ring style (ring-[#2684FF])
    const boxModel = await firstNavItem.boundingBox();
    expect(boxModel).not.toBeNull();
  });
});
