import { test, expect, type Route, type Request, type Page } from '@playwright/test';

/**
 * E2E — Acessibilidade do rótulo de vencimento
 * ---------------------------------------------
 * Para cada elemento visível que renderiza o rótulo "Venc. dd/mm"
 * (ou o fallback "Venc. --/--"), verifica:
 *
 *  1. Existe um `aria-label` no MESMO nó (ou em um ancestral próximo)
 *     no formato canônico "Vencimento em dd/mm" — ou "Vencimento
 *     indisponível" quando o rótulo visível é "Venc. --/--".
 *
 *  2. NENHUM atributo acessível da página inteira (`aria-label`,
 *     `aria-labelledby` resolvido, `aria-describedby` resolvido,
 *     `title`, `alt`) contém a wording legada "Fatura {mês}".
 *
 * Cobre Home (/) e /cards com cartões válidos, e adicionalmente um
 * cartão com data inválida para validar o fallback acessível.
 */

const USER_EMAIL = 'teste@teste.com.br';
const USER_PASS = 'bra2008';

const FIXTURE_USER_ID = '00000000-0000-4000-8000-0000000000ff';

const VALID_CARD = {
  id: 'cccccccc-cccc-4ccc-8ccc-ccccccccca11',
  user_id: FIXTURE_USER_ID,
  name: 'Cartão Aria E2E Válido',
  emoji: '💳',
  color: '#3B82F6',
  is_visible: true,
  closing_day: 5,
  due_day: 12,
  sort_order: 0,
  credit_limit: 8000,
  created_at: '2025-01-01T00:00:00.000Z',
};

const INVALID_CARD = {
  id: 'cccccccc-cccc-4ccc-8ccc-ccccccccca22',
  user_id: FIXTURE_USER_ID,
  name: 'Cartão Aria E2E Inválido',
  emoji: '💳',
  color: '#EF4444',
  is_visible: true,
  closing_day: null as unknown as number,
  due_day: null as unknown as number,
  sort_order: 1,
  credit_limit: 4000,
  created_at: '2025-01-01T00:00:00.000Z',
};

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

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
    if (table === 'cards') return respond([VALID_CARD, INVALID_CARD]);
    if (table === 'transactions') return respond([]);
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

type DueNode = {
  visibleText: string;   // Ex.: "Venc. 12/07" ou "Venc. --/--"
  ariaLabel: string | null; // aria-label resolvido no nó ou ancestral (até 4 níveis)
};

/**
 * Coleta todo nó cujo `innerText` combine com o rótulo canônico do
 * helper `formatDueLabel` e devolve o `aria-label` associado
 * (procurado no próprio nó ou nos até 4 ancestrais mais próximos,
 * espelhando o padrão do código: aria-label no <p>, texto no <span>).
 */
async function collectDueNodes(page: Page): Promise<DueNode[]> {
  return await page.evaluate(() => {
    const results: { visibleText: string; ariaLabel: string | null }[] = [];
    const RX = /Venc\.\s+(\d{2}\/\d{2}|--\/--)/;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node: Element | null = walker.currentNode as Element;
    while (node) {
      const el = node as HTMLElement;
      // Só olha o texto DIRETO desse nó, para evitar reclamar o rótulo
      // via bubbling de todos os ancestrais.
      let directText = '';
      for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) directText += child.textContent || '';
      }
      const match = directText.match(RX);
      if (match) {
        // Procura aria-label no próprio nó ou até 4 ancestrais acima.
        let cursor: HTMLElement | null = el;
        let ariaLabel: string | null = null;
        for (let i = 0; i < 5 && cursor; i++) {
          const v = cursor.getAttribute('aria-label');
          if (v) { ariaLabel = v; break; }
          cursor = cursor.parentElement;
        }
        results.push({ visibleText: match[0], ariaLabel });
      }
      node = walker.nextNode() as Element | null;
    }
    return results;
  });
}

/**
 * Coleta TODOS os atributos acessíveis da página inteira:
 *  - aria-label direto
 *  - aria-labelledby (resolve para o textContent dos ids)
 *  - aria-describedby (resolve para o textContent dos ids)
 *  - title, alt
 */
async function collectAccessibleAttrs(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const out: string[] = [];
    const push = (v: string | null | undefined) => { if (v) out.push(v); };
    const resolveIds = (ids: string | null) => {
      if (!ids) return;
      for (const id of ids.split(/\s+/).filter(Boolean)) {
        const target = document.getElementById(id);
        if (target) out.push(target.textContent || '');
      }
    };
    document.querySelectorAll('*').forEach((el) => {
      const h = el as HTMLElement;
      push(h.getAttribute('aria-label'));
      push(h.getAttribute('title'));
      push(h.getAttribute('alt'));
      resolveIds(h.getAttribute('aria-labelledby'));
      resolveIds(h.getAttribute('aria-describedby'));
    });
    return out;
  });
}

function assertAriaMatchesVisible(nodes: DueNode[], routeLabel: string) {
  expect(nodes.length, `[${routeLabel}] nenhum rótulo "Venc." encontrado`).toBeGreaterThan(0);
  for (const { visibleText, ariaLabel } of nodes) {
    expect(
      ariaLabel,
      `[${routeLabel}] rótulo "${visibleText}" sem aria-label acessível`,
    ).not.toBeNull();

    if (visibleText === 'Venc. --/--') {
      expect(
        ariaLabel,
        `[${routeLabel}] fallback deve expor "Vencimento indisponível", recebi "${ariaLabel}"`,
      ).toBe('Vencimento indisponível');
    } else {
      // Extrai "dd/mm" do rótulo visível e verifica o aria-label completo.
      const m = visibleText.match(/(\d{2}\/\d{2})/);
      expect(m, `[${routeLabel}] rótulo visível malformado: ${visibleText}`).not.toBeNull();
      const expected = `Vencimento em ${m![1]}`;
      expect(
        ariaLabel,
        `[${routeLabel}] aria-label divergente do rótulo visível "${visibleText}"`,
      ).toBe(expected);
    }

    // Nunca a wording legada, direta ou disfarçada.
    expect(ariaLabel).not.toMatch(/Fatura/i);
    expect(ariaLabel).not.toMatch(/NaN|undefined|Invalid Date/i);
  }
}

function assertNoLegacyFaturaInAttrs(attrs: string[], routeLabel: string) {
  for (const value of attrs) {
    for (const m of MONTH_NAMES) {
      const rx = new RegExp(`Fatura\\s+${m}\\b`, 'i');
      expect(
        rx.test(value),
        `[${routeLabel}] wording legada "Fatura ${m}" encontrada em atributo acessível: "${value}"`,
      ).toBe(false);
    }
  }
}

test.describe('Acessibilidade — aria-label do rótulo de vencimento', () => {
  test.beforeEach(async ({ page }) => {
    await installFixtures(page);
    await login(page);
  });

  test('Home: aria-label corresponde ao rótulo visível e nunca cita "Fatura {mês}"', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(VALID_CARD.name).first()).toBeVisible({ timeout: 10_000 });

    const nodes = await collectDueNodes(page);
    assertAriaMatchesVisible(nodes, 'Home');

    const attrs = await collectAccessibleAttrs(page);
    assertNoLegacyFaturaInAttrs(attrs, 'Home');

    // Cobertura mista: pelo menos um cartão válido (dd/mm) E o inválido (--/--).
    const kinds = new Set(nodes.map((n) => (n.visibleText.endsWith('--/--') ? 'fallback' : 'valid')));
    expect(kinds.has('valid'), 'Esperava ao menos um rótulo dd/mm na Home').toBe(true);
    expect(kinds.has('fallback'), 'Esperava ao menos um rótulo --/-- na Home').toBe(true);
  });

  test('/cards: aria-label corresponde ao rótulo visível e nunca cita "Fatura {mês}"', async ({ page }) => {
    await page.goto('/cards');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(VALID_CARD.name).first()).toBeVisible({ timeout: 10_000 });

    const nodes = await collectDueNodes(page);
    assertAriaMatchesVisible(nodes, '/cards');

    const attrs = await collectAccessibleAttrs(page);
    assertNoLegacyFaturaInAttrs(attrs, '/cards');

    const kinds = new Set(nodes.map((n) => (n.visibleText.endsWith('--/--') ? 'fallback' : 'valid')));
    expect(kinds.has('valid'), 'Esperava ao menos um rótulo dd/mm em /cards').toBe(true);
    expect(kinds.has('fallback'), 'Esperava ao menos um rótulo --/-- em /cards').toBe(true);
  });

  test('/cards → diálogo da fatura: aria-label consistente ao abrir o modal', async ({ page }) => {
    await page.goto('/cards');
    await page.waitForLoadState('networkidle');

    const trigger = page.getByText(VALID_CARD.name).first();
    await expect(trigger).toBeVisible({ timeout: 10_000 });
    await trigger.click();

    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const nodes = await collectDueNodes(page);
    // Filtra só nós que estão DENTRO de um dialog aberto.
    const inDialog = await page.evaluate(() => {
      const RX = /Venc\.\s+(\d{2}\/\d{2}|--\/--)/;
      const out: { visibleText: string; ariaLabel: string | null }[] = [];
      document.querySelectorAll('[role="dialog"]').forEach((d) => {
        const walker = document.createTreeWalker(d, NodeFilter.SHOW_ELEMENT);
        let node: Element | null = walker.currentNode as Element;
        while (node) {
          const el = node as HTMLElement;
          let directText = '';
          for (const c of Array.from(el.childNodes)) {
            if (c.nodeType === Node.TEXT_NODE) directText += c.textContent || '';
          }
          const m = directText.match(RX);
          if (m) {
            let cursor: HTMLElement | null = el;
            let ariaLabel: string | null = null;
            for (let i = 0; i < 5 && cursor; i++) {
              const v = cursor.getAttribute('aria-label');
              if (v) { ariaLabel = v; break; }
              cursor = cursor.parentElement;
            }
            out.push({ visibleText: m[0], ariaLabel });
          }
          node = walker.nextNode() as Element | null;
        }
      });
      return out;
    });

    expect(inDialog.length, 'Diálogo da fatura deve exibir o rótulo "Venc."').toBeGreaterThan(0);
    assertAriaMatchesVisible(inDialog, '/cards → dialog');

    const attrs = await collectAccessibleAttrs(page);
    assertNoLegacyFaturaInAttrs(attrs, '/cards → dialog');

    // Sanidade: também não esperamos rótulos degradados no modal do cartão válido.
    for (const n of nodes) expect(n.visibleText).toMatch(/^Venc\. (\d{2}\/\d{2}|--\/--)$/);
  });
});
