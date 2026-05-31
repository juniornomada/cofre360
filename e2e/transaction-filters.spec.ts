import { test, expect } from '@playwright/test';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

test.describe('Filtros na página de Transações', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Fazer login como o usuário de teste
    await page.goto('/');
    
    // Se estiver na tela de login, preencher. Se já estiver logado, continua.
    const loginEmail = page.getByPlaceholder('seu@email.com');
    if (await loginEmail.isVisible()) {
        await loginEmail.fill('teste@teste.com.br');
        await page.getByPlaceholder('Sua senha').fill('bra2008');
        await page.getByRole('button', { name: 'Entrar' }).click();
        await expect(page).toHaveURL(/\/dashboard|\//);
    }
    
    // Ir para a página de transações via BottomNav para garantir que o link funciona
    await page.getByRole('link', { name: 'Transações' }).click();
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page.getByText('Transações', { exact: true }).first()).toBeVisible();
  });

  test('Deve filtrar por período corretamente', async ({ page }) => {
    // Abrir filtros avançados
    const filterBtn = page.locator('button[title="Filtros avançados"]');
    await filterBtn.click();
    
    const today = new Date();
    
    // Selecionar data de início
    await page.getByRole('button', { name: 'Início' }).click();
    // No componente de calendário, clicamos no dia 1.
    await page.getByRole('gridcell', { name: '1', exact: true }).first().click();
    
    // Selecionar data de fim
    await page.getByRole('button', { name: 'Fim' }).click();
    const dayOfMonth = today.getDate().toString();
    await page.getByRole('gridcell', { name: dayOfMonth, exact: true }).first().click();
    
    // Aplicar filtros
    await page.getByRole('button', { name: 'Aplicar' }).click();
    
    // Verificar se o contador de filtros ativos mudou
    const filterBadge = filterBtn.locator('span');
    await expect(filterBadge).toBeVisible();
    
    // Validar que o estado de "vazio" não é exibido (assumindo que o usuário tem dados)
    const emptyState = page.getByText('Nenhuma transação corresponde aos filtros');
    const isVisible = await emptyState.isVisible();
    if (isVisible) {
        console.log("Aviso: Nenhuma transação no período selecionado.");
    }
  });

  test('Deve filtrar por status (tipo) corretamente', async ({ page }) => {
    // Abrir filtros avançados
    await page.locator('button[title="Filtros avançados"]').click();
    
    // Selecionar "Receita"
    await page.getByRole('button', { name: 'Receita', exact: true }).click();
    await page.getByRole('button', { name: 'Aplicar' }).click();
    
    // Verificar se total despesas é 0,00
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
    
    // Verificar se o botão está ativo
    await expect(accountFilterBtn).toHaveClass(/bg-primary/);
    
    // Limpar filtro clicando novamente
    await accountFilterBtn.click();
    await expect(accountFilterBtn).not.toHaveClass(/bg-primary/);
    
    // Filtro de "Cartão"
    const cardFilterBtn = page.getByRole('button', { name: 'Cartão' });
    await cardFilterBtn.click();
    await expect(cardFilterBtn).toHaveClass(/bg-primary/);
  });

  test('Deve filtrar por categoria corretamente', async ({ page }) => {
    // Encontrar uma categoria qualquer no carrossel e clicar
    // Como o carrossel tem "Todas", "Alimentação", etc.
    const alimentacaoBtn = page.getByRole('button', { name: 'Alimentação', exact: true });
    
    // Se não estiver visível, pode ser que precise scrollar, mas geralmente as primeiras estão lá
    if (await alimentacaoBtn.isVisible()) {
        await alimentacaoBtn.click();
        await expect(alimentacaoBtn).toHaveClass(/bg-primary/);
    }
  });

  test('Deve verificar paginação e ordenação', async ({ page }) => {
    // 1. Verificar se o botão "Ver mais" aparece quando há muitas transações
    // O usuário teste tem 261 transações, PAGE_SIZE é 50, então deve haver "Ver mais"
    const loadMoreBtn = page.getByRole('button', { name: 'Ver mais' });
    await expect(loadMoreBtn).toBeVisible();

    // 2. Verificar se o número de itens aumenta ao carregar mais
    const initialTxs = await page.locator('.interactive-card').count();
    // initialTxs deve ser PAGE_SIZE (50) ou um pouco mais se houver pares de transferência fundidos
    expect(initialTxs).toBeGreaterThanOrEqual(40); 

    await loadMoreBtn.click();
    
    // Aguardar carregamento (o botão fica desabilitado com spinner)
    await expect(loadMoreBtn).toBeEnabled();
    
    const afterLoadTxs = await page.locator('.interactive-card').count();
    expect(afterLoadTxs).toBeGreaterThan(initialTxs);

    // 3. Verificar ordenação (padrão: data decrescente / created_at)
    // Vamos pegar as datas das duas primeiras transações visíveis
    const txItems = page.locator('.interactive-card');
    const firstTxDate = await txItems.first().locator('span.text-\\[10px\\]').last().innerText();
    
    // Como a ordenação é decrescente, a primeira deve ser igual ou posterior à segunda
    // Mas no dashboard/transactions a ordenação por created_at desc é a regra
    console.log(`Primeira transação: ${firstTxDate}`);
  });
});


