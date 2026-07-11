import { test, expect, type Route, type Request, type ConsoleMessage } from '@playwright/test';

/**
 * E2E — Invariante `created_at` no loader da Home
 * ----------------------------------------------------------------
 * Este teste protege contra a regressão histórica em `src/routes/index.tsx`
 * onde o mapper copiava `t.date` (string textual como "10 jul") para o
 * campo `created_at` da DTO consumida por `parseTxDate`. Como
 * `parseTxDate` usa `created_at` como fallback confiável na heurística
 * Dez↔Jan, sobrescrever com `date` textual corrompe o cycle key.
 *
 * O contrato está codificado em `src/lib/created-at-invariant.ts`:
 *   • `created_at` DEVE ser ISO 8601 válido, ou null/undefined.
 *   • Qualquer outra string (ex.: "10 jul", "31 dez") é violação.
 *   • Em dev/test `sanitizeCreatedAt` lança `CreatedAtInvariantError`;
 *     em prod ele apenas `console.warn` e cai para o relógio atual.
 *
 * Estratégia
 * ----------
 * 1. Injeta um hook cedo (`addInitScript`) que captura violações do
 *    invariante — tanto via `console.warn` quanto via `window.onerror`
 *    / `unhandledrejection` — em `window.__createdAtViolations`.
 * 2. Intercepta a leitura de `transactions` no PostgREST e devolve UMA
 *    linha "envenenada" onde `created_at` = "10 jul" (o vetor exato
 *    da regressão). As demais tabelas são fielmente fallback.
 * 3. Navega para `/` e verifica:
 *      (a) A Home NÃO trava — continua renderizando (sanitizer defensivo).
 *      (b) Pelo menos uma violação foi observada e a mensagem cita
 *          `[created-at-invariant]` + o campo `date`-like envenenado
 *          ("10 jul"), provando que o loader rejeitou a sobrescrita.
 * 4. Caso de controle negativo: quando o mesmo payload é servido com
 *    `created_at` ISO válido, NENHUMA violação deve ser reportada.
 *
 * Se `/auth` não estiver disponível no ambiente (CI local sem Supabase
 * de teste), o spec é `skip` — o contrato já é coberto pelos testes
 * unitários em `src/lib/__tests__/created-at-invariant.test.ts`.
 */

const USER_EMAIL = 'teste@teste.com.br';
const USER_PASS = 'bra2008';

const FIXTURE_USER_ID = '00000000-0000-4000-8000-0000000000aa';
const FIXTURE_CARD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FIXTURE_TX_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// Vetor exato do bug: `date` textual sem ano, promovido a `created_at`.
const POISONED_TEXTUAL_DATE = '10 jul';
const VALID_ISO_CREATED_AT = '2026-07-10T13:00:00.000Z';

const cardFixture = {
  id: FIXTURE_CARD_ID,
  user_id: FIXTURE_USER_ID,
  name: 'Invariant Guard Card',
  emoji: '💳',
  color: '#3B82F6',
  is_visible: true,
  closing_day: 25,
  due_day: 5,
  sort_order: 0,
  credit_limit: 5000,
  created_at: '2025-01-01T00:00:00.000Z',
};

function makeTx(createdAt: string) {
  return {
    id: FIXTURE_TX_ID,
    user_id: FIXTURE_USER_ID,
    icon: '🛒',
    name: 'TX envenenada',
    category: 'Geral',
    date: POISONED_TEXTUAL_DATE,
    amount: 100,
    type: 'expense',
    card: 'Invariant Guard Card',
    bank_account_id: null,
    installment_group_id: null,
    installment_number: 1,
    total_installments: 1,
    installment_mode: null,
    installment_source_amount: null,
    is_visible: true,
    created_at: createdAt, // <-- ponto do contrato
  };
}

async function installViolationHook(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    // Guarda-chuva global para o teste ler ao final.
    (window as unknown as { __createdAtViolations: string[] }).__createdAtViolations = [];
    const push = (msg: string) => {
      if (typeof msg === 'string' && msg.includes('[created-at-invariant]')) {
        (window as unknown as { __createdAtViolations: string[] }).__createdAtViolations.push(msg);
      }
    };
    const origWarn = console.warn.bind(console);
    console.warn = (...args: unknown[]) => {
      push(args.map(String).join(' '));
      origWarn(...args);
    };
    const origError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      push(args.map(String).join(' '));
      origError(...args);
    };
    window.addEventListener('error', (e) => push(String(e.message ?? '')));
    window.addEventListener('unhandledrejection', (e) => {
      const reason = (e as PromiseRejectionEvent).reason;
      push(typeof reason === 'string' ? reason : reason?.message ?? '');
    });
  });
}

async function installFixtures(
  page: import('@playwright/test').Page,
  variant: 'poisoned' | 'clean',
) {
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
    if (table === 'transactions') {
      const createdAt = variant === 'poisoned' ? POISONED_TEXTUAL_DATE : VALID_ISO_CREATED_AT;
      return respond([makeTx(createdAt)]);
    }
    // Deixe demais tabelas passarem — dados vazios são aceitáveis.
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

async function readViolations(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __createdAtViolations: string[] }).__createdAtViolations ?? [],
  );
}

test.describe('Home loader — invariante de created_at', () => {
  test.beforeEach(async ({ page }) => {
    await installViolationHook(page);
    await login(page);
  });

  test('rejeita created_at vindo de `date` textual e não trava a Home', async ({ page }) => {
    // Coleta adicional via console (redundância defensiva).
    const consoleMsgs: string[] = [];
    page.on('console', (m: ConsoleMessage) => {
      const t = m.text();
      if (t.includes('[created-at-invariant]')) consoleMsgs.push(t);
    });

    await installFixtures(page, 'poisoned');
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // (a) A Home NÃO deve travar — o sanitizer troca o valor por now()
    //     em prod/preview e apenas registra o warning. Confirmamos que
    //     a árvore continua renderizada checando o body não-vazio.
    const bodyText = (await page.textContent('body')) ?? '';
    expect(bodyText.length, 'Home deve seguir renderizando após violação').toBeGreaterThan(0);

    // (b) Foi observada ao menos uma violação citando o valor envenenado.
    const violations = [...(await readViolations(page)), ...consoleMsgs];
    const matched = violations.filter(
      (v) => v.includes('[created-at-invariant]') && v.includes(POISONED_TEXTUAL_DATE),
    );

    expect(
      matched.length,
      `Esperado ao menos 1 aviso de invariante mencionando "${POISONED_TEXTUAL_DATE}". ` +
        `Coletados: ${JSON.stringify(violations, null, 2)}`,
    ).toBeGreaterThanOrEqual(1);

    // A mensagem deve indicar o contexto do mapper afetado (regressão
    // histórica: `index.tsx:txsByName` ou `index.tsx:formattedTxs`).
    expect(matched.some((v) => /index\.tsx:(txsByName|formattedTxs)/.test(v))).toBe(true);
  });

  test('controle: created_at ISO válido NÃO dispara violação', async ({ page }) => {
    await installFixtures(page, 'clean');
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const violations = await readViolations(page);
    expect(
      violations.filter((v) => v.includes('[created-at-invariant]')),
      `Nenhuma violação esperada com created_at ISO válido. Recebido: ${JSON.stringify(violations)}`,
    ).toHaveLength(0);
  });
});
