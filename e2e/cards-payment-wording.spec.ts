import { test, expect, type Route, type Request } from '@playwright/test';
import {
  findLegacyPaymentWording,
  normalizeForCheck,
} from './helpers/payment-wording';

/**
 * E2E — /cards não exibe wording legada de pagamento
 * ----------------------------------------------------------------
 * Garante que em nenhuma parte da UI de /cards aparece a descrição
 * antiga:
 *   • "Pagamento Parcial fatura cartão …"
 *   • "Pagamento Total fatura cartão …"
 *
 * O formato canônico é "Pagamento {Total|Parcial} cartão <Nome>" —
 * qualquer variação com "fatura" indica regressão.
 *
 * A verificação passa por `normalizeForCheck` (NFKC + strip de
 * diacríticos + colapso de whitespace Unicode + lowercase) antes de
 * casar contra os padrões, o que elimina:
 *   – falsos NEGATIVOS por variação de acento/capitalização/whitespace
 *     Unicode (NBSP, zero-width, combining diacritic);
 *   – falsos POSITIVOS por casamento de substring fora de contexto —
 *     os padrões exigem a sequência completa "pagamento (total|parcial)
 *     fatura [do|da|de]? cartao" com word boundary final.
 *
 * Estratégia de fixture:
 *  1. Faz login (se o ambiente permitir; caso contrário `skip`).
 *  2. Intercepta o PostgREST e devolve fixtures com um cartão, uma
 *     despesa e um pagamento cuja descrição canônica é válida.
 *  3. Navega para /cards, abre o diálogo da fatura e escaneia o body.
 */

const USER_EMAIL = 'teste@teste.com.br';
const USER_PASS = 'bra2008';

const FIXTURE_USER_ID = '00000000-0000-4000-8000-0000000000ee';
const FIXTURE_CARD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FIXTURE_TX_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const FIXTURE_PAYMENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const CARD_NAME = 'Porto Bank E2E';


const cardFixture = {
  id: FIXTURE_CARD_ID,
  user_id: FIXTURE_USER_ID,
  name: CARD_NAME,
  emoji: '💳',
  color: '#3B82F6',
  is_visible: true,
  closing_day: 25,
  due_day: 5,
  sort_order: 0,
  credit_limit: 5000,
  created_at: '2025-01-01T00:00:00.000Z',
};

function makeTransaction() {
  return {
    id: FIXTURE_TX_ID,
    user_id: FIXTURE_USER_ID,
    icon: '🛒',
    name: 'Compra teste',
    category: 'Alimentação',
    date: '2026-07-10',
    amount: 150,
    type: 'expense',
    card: CARD_NAME,
    bank_account_id: null,
    installment_group_id: null,
    installment_number: 1,
    total_installments: 1,
    installment_mode: null,
    installment_source_amount: null,
    is_visible: true,
    created_at: '2026-07-10T13:00:00.000Z',
  };
}

function makeCardPayment() {
  return {
    id: FIXTURE_PAYMENT_ID,
    user_id: FIXTURE_USER_ID,
    card_id: FIXTURE_CARD_ID,
    amount: 50,
    paid_at: '2026-07-11',
    target_period: '2026-07-25',
    // Descrição no formato canônico — nenhuma variação legada.
    description: `Pagamento Parcial cartão ${CARD_NAME}`,
    created_at: '2026-07-11T10:00:00.000Z',
  };
}

async function installFixtures(page: import('@playwright/test').Page) {
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
    if (table === 'transactions') return respond([makeTransaction()]);
    if (table === 'card_payments') return respond([makeCardPayment()]);
    return route.fallback();
  });
}

async function login(page: import('@playwright/test').Page) {
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

function assertNoLegacyWording(sample: string, where: string) {
  const normalized = normalizeForCheck(sample);
  // Sanidade: se a normalização apagou tudo, algo está errado no capture —
  // não queremos que o teste "passe" contra uma string vazia.
  expect(
    normalized.length,
    `Amostra vazia após normalização em ${where} — captura provavelmente falhou`,
  ).toBeGreaterThan(0);

  const hit = findLegacyPaymentWording(sample);
  expect(
    hit,
    hit
      ? `Wording legada detectada em ${where}: /${hit.pattern.source}/\nTrecho: "${hit.excerpt}"`
      : '',
  ).toBeNull();
}


test.describe('/cards — wording de pagamento canônica', () => {
  test.beforeEach(async ({ page }) => {
    await installFixtures(page);
    await login(page);
  });

  test('não exibe "Pagamento Parcial/Total fatura cartão" em /cards', async ({ page }) => {
    await page.goto('/cards');
    await page.waitForLoadState('networkidle');

    // 1) Nível da página inicial de /cards (lista de cartões + resumos).
    const pageText = (await page.textContent('body')) ?? '';
    expect(pageText.length, '/cards deve renderizar conteúdo').toBeGreaterThan(0);
    assertNoLegacyWording(pageText, '/cards (listagem)');

    // 2) Abre o diálogo da fatura do cartão fixture, se disponível.
    const cardTrigger = page.getByText(CARD_NAME).first();
    if (await cardTrigger.isVisible().catch(() => false)) {
      await cardTrigger.click();
      // Aguarda o diálogo abrir; heurística: title/heading contendo "fatura"
      // (o nome do diálogo em pt-BR) OU role=dialog visível.
      await page
        .waitForSelector('[role="dialog"]', { timeout: 5_000 })
        .catch(() => {
          /* tolerante — segue com o body inteiro */
        });
      const dialogText =
        (await page.locator('[role="dialog"]').first().textContent().catch(() => null)) ??
        (await page.textContent('body')) ??
        '';
      assertNoLegacyWording(dialogText, 'diálogo da fatura');
    }

    // 3) Sweep final: body inteiro após abrir o diálogo.
    const finalText = (await page.textContent('body')) ?? '';
    assertNoLegacyWording(finalText, '/cards (pós-diálogo)');
  });
});
