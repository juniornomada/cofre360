const STYLE_ID = "cofre360-invoice-transaction-row-interactions";
const ROW_SELECTOR = '[data-testid="invoice-transaction-item"]';

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    ${ROW_SELECTOR} {
      cursor: pointer;
      border-radius: 0.5rem;
      transition: background-color 150ms ease;
    }

    ${ROW_SELECTOR}:hover {
      background-color: color-mix(in oklab, var(--color-accent) 28%, transparent);
    }

    /* Give the description room while keeping a clear visual gap before the amount. */
    ${ROW_SELECTOR} > div:first-of-type {
      padding-right: 0.5rem;
    }

    ${ROW_SELECTOR} > div:last-of-type {
      margin-left: 0.9rem !important;
      gap: 0.55rem !important;
    }

    ${ROW_SELECTOR} > div:last-of-type > span:first-child {
      min-width: 5rem;
      text-align: right;
    }

    /* The row itself is now the edit affordance, so the pencil is unnecessary. */
    ${ROW_SELECTOR} > div:last-of-type > button[aria-label^="Editar "] {
      display: none !important;
    }

    /* Remove the mobile overflow menu and expose only the delete shortcut. */
    ${ROW_SELECTOR} > div:last-of-type > div:has(button[aria-label^="Mais ações"]) {
      display: none !important;
    }

    /* Reuse the existing desktop delete action on every viewport. */
    ${ROW_SELECTOR} > div:last-of-type > div:has(> button[aria-label="Excluir transação"]) {
      display: flex !important;
      opacity: 1 !important;
      transform: none !important;
      gap: 0 !important;
    }

    ${ROW_SELECTOR} > div:last-of-type > div:has(> button[aria-label="Excluir transação"]) > button[aria-label="Editar transação"] {
      display: none !important;
    }

    ${ROW_SELECTOR} > div:last-of-type > div:has(> button[aria-label="Excluir transação"]) > button[aria-label="Excluir transação"] {
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
    }
  `;
  document.head.appendChild(style);
}

function isInteractiveTarget(target: Element) {
  return Boolean(target.closest('button, a, input, textarea, select, [role="button"], [role="menuitem"]'));
}

function openRowEditor(row: Element) {
  const editButton = row.querySelector<HTMLButtonElement>(
    'button[aria-label^="Editar "]',
  );
  editButton?.click();
}

function handleInvoiceRowClick(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element) || isInteractiveTarget(target)) return;

  const row = target.closest(ROW_SELECTOR);
  if (!row) return;
  openRowEditor(row);
}

export function installInvoiceTransactionRowInteractions() {
  if (typeof document === "undefined") return;

  installStyles();

  const globalKey = "__cofre360InvoiceRowInteractionsInstalled";
  const globalState = globalThis as typeof globalThis & Record<string, unknown>;
  if (globalState[globalKey]) return;

  globalState[globalKey] = true;
  document.addEventListener("click", handleInvoiceRowClick);
}
