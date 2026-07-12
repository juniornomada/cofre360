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

/**
 * Coleta o texto do diálogo da fatura via data-testid estáveis, sem
 * depender de role="dialog" ou de posicionamento no DOM. Concatena o
 * conteúdo dos slots relevantes (título, composição, pagamentos,
 * transações e estados vazios) em uma única string para a checagem de
 * wording.
 */
async function collectInvoiceDialogText(
  page: import('@playwright/test').Page,
  dialog: import('@playwright/test').Locator,
): Promise<string> {
  // Fallback: texto inteiro do diálogo via testid raiz.
  const rootText = (await dialog.textContent().catch(() => null)) ?? '';

  // Slots explícitos — se um dia o layout mudar, cada um continua
  // acessível pelo seu testid.
  const slotIds = [
    'invoice-dialog-title',
    'invoice-dialog-card-name',
    'invoice-dialog-empty',
    'invoice-composition',
    'invoice-payments-list',
    'invoice-payment-item',
    'invoice-payments-empty',
    'invoice-transactions-list',
    'invoice-transaction-item',
    'invoice-transaction-name',
  ] as const;

  const parts: string[] = [rootText];
  for (const id of slotIds) {
    const loc = page.getByTestId(id);
    const count = await loc.count().catch(() => 0);
    for (let i = 0; i < count; i += 1) {
      const t = await loc.nth(i).textContent().catch(() => null);
      if (t) parts.push(t);
    }
  }
  return parts.join('\n');
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
      // Seletor estável por data-testid, independente do layout/role.
      const dialog = page.getByTestId('invoice-dialog').first();
      const opened = await dialog
        .waitFor({ state: 'visible', timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      const dialogText = opened
        ? await collectInvoiceDialogText(page, dialog)
        : ((await page.textContent('body')) ?? '');
      assertNoLegacyWording(dialogText, 'diálogo da fatura');
    }

    // 3) Sweep final: body inteiro após abrir o diálogo.
    const finalText = (await page.textContent('body')) ?? '';
    assertNoLegacyWording(finalText, '/cards (pós-diálogo)');
  });
});

});

/* ------------------------------------------------------------------ *
 * Segundo caso E2E — navega entre múltiplos cartões e garante que
 * nenhum diálogo de fatura exibe o texto legado.
 *
 * Diferença crítica em relação ao teste acima:
 *  ▸ Servimos fixtures com MÚLTIPLOS cartões. Cada cartão tem
 *    pagamentos cuja `description` no banco é EXATAMENTE o rótulo
 *    LEGADO (Pagamento Parcial/Total fatura cartão …), com variações
 *    de acento, capitalização e whitespace.
 *  ▸ Se a UI não normalizar em runtime (normalizeCardPaymentLabel em
 *    cards.tsx), o legado escapa e o teste falha.
 *  ▸ Iteramos por cada cartão, abrimos o diálogo da fatura, capturamos
 *    o texto do diálogo e do body inteiro, fechamos e passamos para o
 *    próximo — validando cada trânsito.
 * ------------------------------------------------------------------ */

type CardFixture = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  closing_day: number;
  due_day: number;
  sort_order: number;
  /** Pagamentos com `description` propositalmente legada. */
  legacyPayments: Array<{ id: string; amount: number; description: string }>;
  /** Uma transação de compra para garantir que a fatura tem conteúdo. */
  purchase: { id: string; name: string; amount: number };
};

const MULTI_CARDS: CardFixture[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Porto Bank Multi',
    emoji: '💳',
    color: '#3B82F6',
    closing_day: 25,
    due_day: 5,
    sort_order: 0,
    legacyPayments: [
      {
        id: '11111111-1111-4111-8111-aaaaaaaaaaaa',
        amount: 100,
        description: 'Pagamento Parcial fatura cartão Porto Bank Multi',
      },
    ],
    purchase: { id: '11111111-1111-4111-8111-bbbbbbbbbbbb', name: 'Mercado A', amount: 250 },
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Nubank Multi',
    emoji: '💳',
    color: '#8A05BE',
    closing_day: 20,
    due_day: 1,
    sort_order: 1,
    legacyPayments: [
      // Variação: "Pagamento Total fatura DO cartão" (conector) + maiúsculas.
      {
        id: '22222222-2222-4222-8222-aaaaaaaaaaaa',
        amount: 300,
        description: 'PAGAMENTO TOTAL FATURA DO CARTÃO Nubank Multi',
      },
    ],
    purchase: { id: '22222222-2222-4222-8222-bbbbbbbbbbbb', name: 'Farmácia B', amount: 80 },
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Itaú Multi',
    emoji: '💳',
    color: '#EC7000',
    closing_day: 15,
    due_day: 28,
    sort_order: 2,
    legacyPayments: [
      // Variação: NBSP entre tokens + "cartao" sem acento.
      {
        id: '33333333-3333-4333-8333-aaaaaaaaaaaa',
        amount: 50,
        description: 'Pagamento\u00A0Parcial\u00A0fatura\u00A0cartao\u00A0Itaú Multi',
      },
    ],
    purchase: { id: '33333333-3333-4333-8333-bbbbbbbbbbbb', name: 'Restaurante C', amount: 120 },
  },
];

function buildMultiCardFixtures() {
  const cards = MULTI_CARDS.map((c) => ({
    id: c.id,
    user_id: FIXTURE_USER_ID,
    name: c.name,
    emoji: c.emoji,
    color: c.color,
    is_visible: true,
    closing_day: c.closing_day,
    due_day: c.due_day,
    sort_order: c.sort_order,
    credit_limit: 5000,
    created_at: '2025-01-01T00:00:00.000Z',
  }));

  const transactions = MULTI_CARDS.map((c) => ({
    id: c.purchase.id,
    user_id: FIXTURE_USER_ID,
    icon: '🛒',
    name: c.purchase.name,
    category: 'Alimentação',
    date: '2026-07-10',
    amount: c.purchase.amount,
    type: 'expense' as const,
    card: c.name,
    bank_account_id: null,
    installment_group_id: null,
    installment_number: 1,
    total_installments: 1,
    installment_mode: null,
    installment_source_amount: null,
    is_visible: true,
    created_at: '2026-07-10T13:00:00.000Z',
  }));

  const cardPayments = MULTI_CARDS.flatMap((c) =>
    c.legacyPayments.map((p) => ({
      id: p.id,
      user_id: FIXTURE_USER_ID,
      card_id: c.id,
      amount: p.amount,
      paid_at: '2026-07-11',
      target_period: '2026-07-25',
      description: p.description, // LEGADO propositalmente
      created_at: '2026-07-11T10:00:00.000Z',
    })),
  );

  return { cards, transactions, cardPayments };
}

async function installMultiCardFixtures(page: import('@playwright/test').Page) {
  const { cards, transactions, cardPayments } = buildMultiCardFixtures();
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

    if (table === 'cards') return respond(cards);
    if (table === 'transactions') return respond(transactions);
    if (table === 'card_payments') return respond(cardPayments);
    return route.fallback();
  });
}

test.describe('/cards — navegação entre múltiplos cartões preserva wording canônica', () => {
  test.beforeEach(async ({ page }) => {
    await installMultiCardFixtures(page);
    await login(page);
  });

  test('nenhum diálogo de fatura exibe o texto legado ao navegar entre cartões', async ({ page }) => {
    await page.goto('/cards');
    await page.waitForLoadState('networkidle');

    // Sanidade da listagem antes de abrir qualquer diálogo.
    const listingText = (await page.textContent('body')) ?? '';
    expect(listingText.length, '/cards deve renderizar conteúdo').toBeGreaterThan(0);
    assertNoLegacyWording(listingText, '/cards (listagem multi-cartões)');

    // Confirma que pelo menos um dos nomes de cartão apareceu — evita
    // falso "OK" quando a listagem não renderizou nenhum cartão.
    const anyCardVisible = await Promise.all(
      MULTI_CARDS.map((c) =>
        page.getByText(c.name, { exact: false }).first().isVisible().catch(() => false),
      ),
    );
    if (!anyCardVisible.some(Boolean)) {
      test.skip(true, 'Nenhum cartão fixture visível — ambiente incompatível com fixture route.');
    }

    // Itera por cada cartão, abre o diálogo, verifica, fecha.
    let dialogsChecked = 0;
    for (const card of MULTI_CARDS) {
      const trigger = page.getByText(card.name, { exact: false }).first();
      if (!(await trigger.isVisible().catch(() => false))) {
        // Cartão desse fixture não renderizou nesse ambiente — segue.
        continue;
      }

      await trigger.click();

      // Seletor estável por data-testid — não depende de role/aria/layout.
      const dialog = page.getByTestId('invoice-dialog').first();
      const opened = await dialog.waitFor({ state: 'visible', timeout: 5_000 })
        .then(() => true)
        .catch(() => false);

      const dialogText = opened
        ? await collectInvoiceDialogText(page, dialog)
        : ((await page.textContent('body')) ?? '');

      assertNoLegacyWording(dialogText, `diálogo da fatura — ${card.name}`);


      // Verificação positiva complementar: o diálogo aberto para ESTE
      // cartão deve conter o nome dele em algum lugar do texto (garante
      // que estamos olhando o diálogo certo antes de assumir "sem legado").
      if (opened) {
        expect(
          normalizeForCheck(dialogText),
          `Diálogo aberto não contém o nome do cartão "${card.name}"`,
        ).toContain(normalizeForCheck(card.name));
      }

      dialogsChecked += 1;

      // Fecha o diálogo antes de navegar para o próximo. Tenta Escape;
      // se falhar, procura por um botão de fechar acessível.
      await page.keyboard.press('Escape').catch(() => {});
      const stillOpen = await dialog.isVisible().catch(() => false);
      if (stillOpen) {
        await page
          .getByRole('button', { name: /fechar|close/i })
          .first()
          .click({ timeout: 2_000 })
          .catch(() => {});
      }
      await dialog.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
    }

    expect(
      dialogsChecked,
      'Nenhum diálogo de fatura foi realmente inspecionado — teste inconclusivo',
    ).toBeGreaterThan(0);

    // Sweep final: depois de navegar por todos os cartões, o body inteiro
    // continua limpo (caches de renderização de outros cartões não podem
    // ter deixado texto legado renderizado fora do diálogo atual).
    const finalText = (await page.textContent('body')) ?? '';
    assertNoLegacyWording(finalText, '/cards (pós-navegação multi-cartões)');
  });
});

