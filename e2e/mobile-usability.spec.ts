import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['iPhone 13'] });

test.describe('Mobile Usability - Transaction Value Keyboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('opening transaction dialog and clicking amount should NOT show OS keyboard', async ({ page }) => {
    // 1. Open Quick Add Transaction Dialog
    // Look for a FAB or button that opens the transaction dialog
    // Assuming there is a button with "+" or "Add" or "Transação"
    const addBtn = page.locator('button:has-text("Adicionar"), button:has-text("+"), button[aria-label*="Adicionar"]');
    await addBtn.first().click();

    // 2. Select "Transferência" type
    const transferBtn = page.locator('button:has-text("Transferência")');
    if (await transferBtn.count() > 0) {
      await transferBtn.click();
    }

    // 3. Find the amount input button (CalculatorAmountInput)
    const amountBtn = page.locator('button[aria-label^="Valor:"]');
    await expect(amountBtn).toBeVisible();

    // 4. Click the amount button to open keypad
    await amountBtn.click();

    // 5. Verify keypad is visible
    const keypad = page.locator('#keypad-dialog');
    await expect(keypad).toBeVisible();

    // 6. Check that the OS keyboard would not be triggered
    // In Playwright, we can't detect the OS keyboard directly, but we can check if any input has focus
    // excluding our own custom numeric keypad buttons.
    const activeElementTag = await page.evaluate(() => document.activeElement?.tagName);
    const activeElementRole = await page.evaluate(() => document.activeElement?.getAttribute('role'));
    const activeElementInputMode = await page.evaluate(() => document.activeElement?.getAttribute('inputmode'));

    // It should be focused on a button (the first keypad button), not an input
    expect(activeElementTag).toBe('BUTTON');
    expect(activeElementInputMode).toBeNull();

    // 7. Type a value using the custom keypad
    await page.locator('button[aria-label="Número 1"]').click();
    await page.locator('button[aria-label="Número 2"]').click();
    await page.locator('button[aria-label="Número 3"]').click();

    // 8. Confirm the value
    await page.locator('button[aria-label="Confirmar valor"]').click();

    // 9. Verify keypad is closed
    await expect(keypad).not.toBeVisible();

    // 10. Verify focus is blurred (dismissing OS keyboard if it was somehow there)
    // On mobile we explicitly call blur() in the component
    const isAnythingFocused = await page.evaluate(() => {
      const active = document.activeElement;
      return active && active !== document.body && active.tagName !== 'BODY';
    });
    
    // On mobile, we prefer it to be blurred to ensure no OS keyboard stays up
    // Note: Playwright might auto-refocus body, so we check if it's NOT an input.
    const finalActiveTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(['BODY', 'BUTTON']).toContain(finalActiveTag);
  });
});
