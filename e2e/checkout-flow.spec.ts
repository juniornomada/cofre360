import { test, expect } from '@playwright/test';

test.describe('Fluxo de Carrinho e Checkout', () => {
  test('Deve adicionar itens ao carrinho, finalizar checkout e verificar transação', async ({ page }) => {
    // 1. Navegar para a loja
    await page.goto('/shop');
    await expect(page.getByText('Loja Cofre 360')).toBeVisible();

    // 2. Adicionar o primeiro produto ao carrinho
    const firstProduct = page.getByText('Plano Premium Anual');
    await expect(firstProduct).toBeVisible();
    
    // Clicar no botão "Adicionar" do primeiro produto
    // Procuramos o botão dentro do card que contém o texto do produto
    await page.locator('div.interactive-card').filter({ hasText: 'Plano Premium Anual' }).getByRole('button', { name: 'Adicionar' }).click();
    
    // Verificar toast de sucesso (pode ser rápido, mas tentamos verificar o contador no carrinho)
    const cartBadge = page.locator('span.bg-primary.text-primary-foreground');
    await expect(cartBadge).toHaveText('1');

    // 3. Adicionar outro produto
    await page.locator('div.interactive-card').filter({ hasText: 'Suporte VIP' }).getByRole('button', { name: 'Adicionar' }).click();
    await expect(cartBadge).toHaveText('2');

    // 4. Ir para o checkout
    await page.locator('button').filter({ has: page.locator('svg.lucide-shopping-cart') }).click();
    await expect(page.getByText('Resumo do Pedido')).toBeVisible();
    await expect(page.getByText('Plano Premium Anual')).toBeVisible();
    await expect(page.getByText('Suporte VIP')).toBeVisible();

    // 5. Finalizar Compra
    // O botão de finalizar compra contém o valor total
    const checkoutBtn = page.getByRole('button', { name: /Finalizar Compra/ });
    await expect(checkoutBtn).toBeEnabled();
    await checkoutBtn.click();

    // 6. Verificar página de sucesso
    await expect(page.getByText('Pagamento Confirmado!')).toBeVisible({ timeout: 10000 });
    
    // 7. Verificar se a transação aparece no histórico
    await page.getByRole('button', { name: 'Ver Transações' }).click();
    await expect(page).toHaveURL(/\/transactions/);
    
    // Procurar pela transação recém criada
    // O nome da transação é "Compra: Plano Premium Anual, Suporte VIP"
    await expect(page.getByText('Compra: Plano Premium Anual, Suporte VIP')).toBeVisible({ timeout: 10000 });
  });

  test('Deve ser possível remover itens do carrinho', async ({ page }) => {
    await page.goto('/shop');
    
    // Adicionar item
    await page.locator('div.interactive-card').first().getByRole('button', { name: 'Adicionar' }).click();
    
    // Abrir carrinho
    await page.locator('button').filter({ has: page.locator('svg.lucide-shopping-cart') }).click();
    
    // Remover item
    await page.locator('button.text-destructive').click();
    
    // Verificar se o carrinho está vazio
    await expect(page.getByText('Seu carrinho está vazio.')).toBeVisible();
  });
});
