import { test, expect, type Route, type Request, type Page } from '@playwright/test';

/**
 * E2E — Diálogo "Pagar Fatura" usa "Venc. dd/mm" com zero-padding
 * ---------------------------------------------------------------
 * Abre /cards → diálogo da fatura → botão "Pagar" e verifica que o
 * cabeçalho do diálogo de pagamento renderiza o rótulo canônico
 * "Venc. dd/mm" (zero-padded) e nunca a wording legada
 * "Fatura {mês}" — em texto visível OU em atributos acessíveis
 * (aria-label / title / alt).
 */

const USER_EMAIL = 'teste@teste.com.br';
const USER_PASS = 'bra2008';

const FIXTURE_USER_ID = '00000000-0000-4000-8000-0000000000ff';
const FIXTURE_CARD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccdff';
const CARD_NAME = 'Cartão Pagar Fatura E2E';

// Closing day = 5, due day = 8 → o dueDate sempre cai em dia 08 → "Venc. 08/mm".
const CLOSING_DAY = 5;
const DUE_DAY = 8;

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const cardFixture = {
  id: FIXTURE_CARD_ID,
  user_id: FIXTURE_USER_ID,
  name: CARD_NAME,
  emoji: '💳',
  color: '#3B82F6',
  is_visible: true,
  closing_day: CLOSING_DAY,
  due_day: DUE_DAY,
  sort_order: 0,
  credit_limit: 5000,
  created_at: '2025-01-01T00:00:00.000Z',
};

// Uma transação recente para garantir que a fatura tenha algo para pagar,
// habilitando o botão "Pagar" no diálogo da fatura.
function buildTx() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(Math.max(1, today.getDate() - 1)).padStart(2, '0');
  return {
    id: 'dddddddd-dddd-4ddd-8ddd-ddddddddd0a1',
    user_id: FIXTURE_USER_ID,
    icon: '🛒',
    name: 'Compra teste',
    category: 'Alimentação',
    date: `${y}-${m}-${d}`,
    amount: 250.5,
    type: 'expense',
    card: CARD_NAME,
    bank_account_id: null,
    installment_group_id: null,
    installment_number: 1,
    total_installments: 1,
    installment_mode: null,
    installment_source_amount: null,
    is_visible: true,
    created_at: `${y}-${m}-${d}T13:00:00.000Z`,
  };
}

async function installFixtures(page: Page) {
  await page.route('**/rest/v1/**', async (route: Route, request: Request) => {
    const url = new URL(request.url());
    const table = url.pathname.replace(/^\/rest\/v1\//, '').split('?')[0];
    const isRead = request.method() === 'GET' || request.method() === 'HEAD';
    if (!isRead) return route.fallback();
    const respond = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-*/*' },
        body: JSON.stringify(body),
      });
    if (table === 'cards') return respond([cardFixture]);
    if (table === 'transactions') return respond([buildTx()]);
    if (table === 'card_payments') return respond([]);
    if (table === 'bank_accounts' || table === 'accounts') return respond([]);
    return route.fallback();
  });
}

async function login(page: Page) {
  await page.goto('/auth');
  const emailInput = page.getByPlaceholder('seu@email.com');
  if (!(await emailInput.isVisible().catch(() => false))) {
    test.skip(true, 'Tela /auth indisponível no ambiente atual.');
  }
  await emailInput.fill(USER_EMAIL);
  await page.getByPlaceholder('Sua senha').fill(USER_PASS);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page
    .waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 15_000 })
    .catch(() => test.skip(true, 'Login indisponível neste ambiente.'));
}

/** Extrai texto visível + aria-label/title/alt dentro de um root. */
async function accessibleTextOf(page: Page, selector: string): Promise<string> {
  return await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return '';
    const parts: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node: Element | null = walker.currentNode as Element;
    while (node) {
      const el = node as HTMLElement;
      for (const attr of ['aria-label', 'title', 'alt']) {
        const v = el.getAttribute?.(attr);
        if (v) parts.push(v);
      }
      node = walker.nextNode() as Element | null;
    }
    parts.push((root as HTMLElement).innerText || '');
    return parts.join('\n');
  }, selector);
}

test.describe('/cards — diálogo "Pagar Fatura" usa "Venc. dd/mm"', () => {
  test.beforeEach(async ({ page }) => {
    await installFixtures(page);
    await login(page);
  });

  test('cabeçalho "Pagar Fatura" mostra "Venc. dd/mm" e nunca "Fatura {mês}"', async ({ page }) => {
    await page.goto('/cards');
    await page.waitForLoadState('networkidle');

    // Abre o diálogo da fatura clicando no cartão.
    const cardTrigger = page.getByText(CARD_NAME).first();
    await expect(cardTrigger, 'Cartão fixture deve aparecer em /cards').toBeVisible({ timeout: 10_000 });
    await cardTrigger.click();

    // Confirma o diálogo da fatura antes de acionar "Pagar".
    const invoiceDialog = page.getByRole('dialog').first();
    await expect(invoiceDialog).toBeVisible({ timeout: 5_000 });

    // Clica no botão "Pagar" para abrir o diálogo de pagamento.
    const payBtn = invoiceDialog.getByRole('button', { name: /^Pagar$/ });
    await expect(payBtn, 'Botão "Pagar" deve estar habilitado').toBeVisible({ timeout: 5_000 });
    await payBtn.click();

    // O diálogo "Pagar Fatura" tem título que começa com "Pagar Fatura —".
    const payDialog = page.getByRole('dialog').filter({ hasText: /Pagar Fatura/ }).first();
    await expect(payDialog).toBeVisible({ timeout: 5_000 });

    // Snapshot completo do texto do diálogo de pagamento.
    const text = await accessibleTextOf(page, '[role="dialog"]:has-text("Pagar Fatura")');

    // 1) Contém o rótulo canônico "Venc. dd/mm" (com zero-padding).
    const canonical = text.match(/Venc\.\s+(\d{2})\/(\d{2})/);
    expect(canonical, 'Rótulo "Venc. dd/mm" ausente do diálogo de pagamento').not.toBeNull();

    // Dia = DUE_DAY, com zero-padding.
    expect(canonical![1]).toBe(String(DUE_DAY).padStart(2, '0'));
    // Mês entre 01 e 12 (exatamente 2 dígitos).
    const monthNum = Number(canonical![2]);
    expect(canonical![2]).toMatch(/^\d{2}$/);
    expect(monthNum).toBeGreaterThanOrEqual(1);
    expect(monthNum).toBeLessThanOrEqual(12);

    // 2) Nunca renderiza formato sem zero-padding (ex.: "Venc. 8/07" ou "Venc. 08/7").
    const singleDigit = text.match(/Venc\.\s+(\d\/\d{1,2}|\d{1,2}\/\d)\b/g) || [];
    const badSingleDigit = singleDigit.filter((m) => !/\d{2}\/\d{2}/.test(m));
    expect(
      badSingleDigit,
      `Rótulo sem zero-padding no diálogo: ${badSingleDigit.join(', ')}`,
    ).toHaveLength(0);

    // 3) Nunca renderiza a wording legada "Fatura {mês}".
    for (const m of MONTH_NAMES) {
      const rx = new RegExp(`Fatura\\s+${m}\\b`, 'i');
      expect(rx.test(text), `Wording legada "Fatura ${m}" apareceu no diálogo`).toBe(false);
    }

    // 4) Também não vaza valores degradados nesse cenário com dados válidos.
    expect(text).not.toMatch(/Venc\.\s*NaN/i);
    expect(text).not.toMatch(/Venc\.\s*undefined/i);
    expect(text).not.toMatch(/Invalid Date/i);

    // 5) Aria-label acessível ("Vencimento em dd/mm") também presente.
    expect(text).toMatch(/Vencimento em \d{2}\/\d{2}/);
  });
});
