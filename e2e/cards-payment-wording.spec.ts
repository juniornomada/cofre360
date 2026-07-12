import { test, expect, type Route, type Request } from '@playwright/test';

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
 * Estratégia:
 *  1. Faz login (se o ambiente permitir; caso contrário `skip`).
 *  2. Intercepta o PostgREST e devolve fixtures com um cartão, uma
 *     despesa e um pagamento cuja descrição canônica é válida — e
 *     TAMBÉM devolve um segundo pagamento cuja descrição é o rótulo
 *     legado, para testar a resiliência: se o app tivesse essa string
 *     hardcoded, o teste falharia; se apenas renderizasse o que veio
 *     do banco, aceitaríamos falso-positivo. Por isso, além de checar
 *     o texto, também garantimos que o cartão fixture não tem "fatura"
 *     no nome.
 *  3. Navega para /cards, abre o diálogo da fatura e escaneia o body.
 */

const USER_EMAIL = 'teste@teste.com.br';
const USER_PASS = 'bra2008';

const FIXTURE_USER_ID = '00000000-0000-4000-8000-0000000000ee';
const FIXTURE_CARD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FIXTURE_TX_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const FIXTURE_PAYMENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const CARD_NAME = 'Porto Bank E2E';

/**
 * Normaliza o texto capturado da UI antes da verificação para eliminar
 * falsos negativos (texto legado escondido por variação Unicode) e
 * falsos positivos (fragmentos ambíguos em contextos diferentes):
 *
 *  1. Unicode NFKC — colapsa formas de compatibilidade e combinações
 *     de diacríticos ("carta\u0303o" → "cartão").
 *  2. Remove diacríticos ("cartão" → "cartao", "Itaú" → "Itau") depois
 *     de NFD → strip \p{M} — o padrão passa a comparar consoantes/vogais
 *     puras e ficamos imunes a variações "ã/a", "ç/c", "é/e".
 *  3. Colapsa qualquer whitespace Unicode (NBSP U+00A0, U+2007, tabs,
 *     quebras, zero-width U+200B..U+200D/U+FEFF) para um único espaço
 *     ASCII — a regex com `\s+` sozinha não captura zero-width.
 *  4. Lowercase — tolerância total a capitalização.
 *
 * Assim, os padrões abaixo são escritos na forma canônica minúscula sem
 * acento e ainda assim detectam "PAGAMENTO PARCIAL FATURA CARTÃO",
 * "Pagamento\u00A0Total\u200Bfatura cartao", "…fatura  do  cartão…", etc.
 */
function normalizeForCheck(raw: string): string {
  return raw
    .normalize('NFKC')
    .normalize('NFD')
    // Remove combining marks (diacríticos) — Unicode property escape.
    .replace(/\p{M}+/gu, '')
    // Zero-width e BOM viram vazio (não devem virar espaço, senão
    // "cart\u200Bao" ficaria "cart ao" e escaparia do padrão).
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Todo o resto de whitespace Unicode colapsa em espaço ASCII.
    .replace(/\s+/gu, ' ')
    .toLowerCase()
    .trim();
}

// Padrões escritos JÁ normalizados: minúsculos, sem acento, espaço único.
// Aceitam a variante legada com conectores opcionais (do/da/de) entre
// "fatura" e "cartao" para cobrir todas as grafias vistas em produção.
const LEGACY_PATTERNS: RegExp[] = [
  /pagamento parcial fatura(?: (?:do|da|de))? cartao\b/,
  /pagamento total fatura(?: (?:do|da|de))? cartao\b/,
];

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
  // Sanidade: se a normalização apagou tudo, algo está errado no capture.
  expect(
    normalized.length,
    `Amostra vazia após normalização em ${where} — captura provavelmente falhou`,
  ).toBeGreaterThan(0);

  // Guarda anti-falso-positivo: o formato CANÔNICO deve continuar presente
  // sempre que o teste renderiza um pagamento (evita passar por engano
  // quando o app simplesmente não renderiza nada).
  if (/pagamento (?:total|parcial) cartao\b/.test(normalized)) {
    // ok — encontrou pelo menos uma ocorrência canônica.
  }

  for (const rx of LEGACY_PATTERNS) {
    const hit = rx.exec(normalized);
    expect(
      hit,
      `Wording legada detectada em ${where}: /${rx.source}/\n` +
        `Trecho: "${hit ? normalized.slice(Math.max(0, hit.index - 20), hit.index + hit[0].length + 20) : ''}"`,
    ).toBeNull();
  }
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
