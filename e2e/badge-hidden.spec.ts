import { test, expect } from '@playwright/test';

test('Lovable badge should be hidden by CSS rules', async ({ page }) => {
  // Navigate to root (will redirect to /auth if not logged in, but CSS is global)
  await page.goto('/');
  
  const selectors = [
    'a[href*="lovable.dev"]',
    'iframe[src*="lovable.dev"]',
    'div[style*="Edit with Lovable"]',
    '.lovable-badge',
    '#lovable-badge'
  ];

  // We check if the styles are applied. 
  // We can inject a mock element to verify the CSS rule works.
  await page.evaluate(() => {
    const mockBadge = document.createElement('div');
    mockBadge.className = 'lovable-badge';
    mockBadge.innerText = 'Should be hidden';
    document.body.appendChild(mockBadge);

    const mockLink = document.createElement('a');
    mockLink.href = 'https://lovable.dev';
    mockLink.innerText = 'Should be hidden';
    document.body.appendChild(mockLink);
  });

  for (const selector of selectors) {
    const element = page.locator(selector).first();
    // Use toBeHidden() which checks display:none, visibility:hidden, etc.
    await expect(element).toBeHidden();
    
    // Also check specific computed styles to be absolutely sure
    const display = await element.evaluate(el => window.getComputedStyle(el).display);
    const opacity = await element.evaluate(el => window.getComputedStyle(el).opacity);
    
    expect(display).toBe('none');
    expect(opacity).toBe('0');
  }
});
