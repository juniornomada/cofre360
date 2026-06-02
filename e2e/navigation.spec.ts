import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('should navigate to profile page and highlight the icon', async ({ page }) => {
    // We need to be logged in to access /profile usually, but let's see if we can just navigate
    // If there's auth redirect, we'll handle it or just test the click logic
    await page.goto('/');

    // Find the profile link in the bottom nav
    const profileLink = page.getByRole('link', { name: /perfil/i });
    
    // Check if it exists
    await expect(profileLink).toBeVisible();

    // Click it
    await profileLink.click();

    // Verify URL change
    await expect(page).toHaveURL(/\/profile/);

    // Verify it's marked as active (aria-current="page")
    await expect(profileLink).toHaveAttribute('aria-current', 'page');
    
    // Verify specific active styles (e.g., primary color)
    // The class 'text-primary' should be present
    await expect(profileLink).toHaveClass(/text-primary/);
  });

  test('should show profile page content', async ({ page }) => {
    // Navigate directly to profile
    await page.goto('/profile');

    // Check for profile heading
    // Based on src/routes/profile.tsx: <h1 className="text-xl font-bold text-foreground">Meu Perfil</h1>
    await expect(page.getByText('Meu Perfil')).toBeVisible();
    
    // Check for menu items
    await expect(page.getByText('Configurações')).toBeVisible();
    await expect(page.getByText('Notificações')).toBeVisible();
    await expect(page.getByText('Segurança')).toBeVisible();
  });
});
