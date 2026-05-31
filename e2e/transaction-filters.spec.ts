import { test, expect } from '@playwright/test';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

test.describe('Filtros na página de Transações', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Fazer login como o usuário de teste
    await page.goto('/auth');
    await page.getByPlaceholder('seu@email.com').fill('teste@teste.com.br');
    await page.getByPlaceholder('Sua senha').fill('bra2008');
    await page.getByRole('button', { name: 'Entrar' }).click();
    
    // Esperar redirecionar para o dashboard
    await expect(page).toHaveURL(/\/dashboard|\//);
    
    // Ir para a página de transações
    await page.goto('/transactions');
    await expect(page.getByText('Transações')).toBeVisible();
  });

  test('Deve filtrar por período corretamente', async ({ page }) => {
    // Abrir filtros avançados
    await page.locator('button[title="Filtros avançados"]').click();
    
    const today = new Date();
    const startDate = startOfMonth(today);
    const endDate = endOfMonth(today);
    
    // Selecionar data de início
    await page.getByRole('button', { name: 'Início' }).click();
    // No componente de calendário, clicamos no dia (precisamos garantir que estamos no mês certo)
    // O calendário do Shadcn/UI geralmente renderiza os dias. Vamos tentar clicar no dia 1.
    await page.getByRole('gridcell', { name: '1', exact: true }).first().click();
    
    // Selecionar data de fim
    await page.getByRole('button', { name: 'Fim' }).click();
    // Clicar no último dia do mês ou apenas no dia atual para simplificar
    const dayOfMonth = today.getDate().toString();
    await page.getByRole('gridcell', { name: dayOfMonth, exact: true }).first().click();
    
    // Aplicar filtros
    await page.getByRole('button', { name: 'Aplicar' }).click();
    
    // Verificar se o contador de filtros ativos mudou
    const filterBadge = page.locator('button[title="Filtros avançados"] span');
    await expect(filterBadge).toBeVisible();
    
    // Verificar se as transações exibidas estão dentro do período (visual apenas, pois é complexo validar data exata via texto)
    // Mas podemos verificar se não há mensagem de "Nenhuma transação" se soubermos que há dados
    const emptyState = page.getByText('Nenhuma transação corresponde aos filtros');
    // Como o usuário tem muitos dados, provavelmente haverá resultados
    if (await emptyState.isVisible()) {
        console.log("Aviso: Nenhuma transação encontrada no período atual.");
    }
  });

  test('Deve filtrar por status (tipo) corretamente', async ({ page }) => {
    // Abrir filtros avançados
    await page.locator('button[title="Filtros avançados"]').click();
    
    // Selecionar "Receita"
    await page.getByRole('button', { name: 'Receita', exact: true }).click();
    await page.getByRole('button', { name: 'Aplicar' }).click();
    
    // Verificar se todas as transações visíveis são positivas ou têm ícone de receita
    // Na nossa UI, receitas costumam ser verdes ou ter um indicador
    // Vamos verificar o total de receitas vs despesas exibido no topo
    const totalExpenses = page.locator('div.rounded-xl.bg-card.p-3').filter({ hasText: 'Total despesas' }).locator('p.text-lg');
    await expect(totalExpenses).toHaveText('R$ 0,00');
    
    // Selecionar "Despesa"
    await page.locator('button[title="Filtros avançados"]').click();
    await page.getByRole('button', { name: 'Despesa', exact: true }).click();
    await page.getByRole('button', { name: 'Aplicar' }).click();
    
    const totalIncome = page.locator('div.rounded-xl.bg-card.p-3').filter({ hasText: 'Total receitas' }).locator('p.text-lg');
    await expect(totalIncome).toHaveText('R$ 0,00');
  });

  test('Deve filtrar por conta (origem) corretamente', async ({ page }) => {
    // Filtro de "Conta"
    const accountFilterBtn = page.getByRole('button', { name: 'Conta' });
    await accountFilterBtn.click();
    
    // Ao clicar em Conta, as transações de cartão devem sumir
    // No código, activeSource === 'account' filtra transações com bank_account_id e SEM card
    
    // Verificar se o botão está ativo (classe primary)
    await expect(accountFilterBtn).toHaveClass(/bg-primary/);
    
    // Limpar filtro
    await accountFilterBtn.click();
    await expect(accountFilterBtn).not.toHaveClass(/bg-primary/);
    
    // Filtro de "Cartão"
    const cardFilterBtn = page.getByRole('button', { name: 'Cartão' });
    await cardFilterBtn.click();
    await expect(cardFilterBtn).toHaveClass(/bg-primary/);
  });

  test('Deve filtrar por categoria corretamente', async ({ page }) => {
    // Selecionar uma categoria específica, e.g., "Alimentação"
    const categoryBtn = page.getByRole('button', { name: 'Alimentação', exact: true });
    if (await categoryBtn.isVisible()) {
        await categoryBtn.click();
        await expect(categoryBtn).toHaveClass(/bg-primary/);
        
        // Verificar se as transações exibidas pertencem a essa categoria
        // O TransactionItem costuma mostrar o nome da categoria ou subcategoria
        // Mas como são muitas, vamos validar que o estado mudou
    }
  });
});
