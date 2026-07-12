import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { PaymentDescriptionText } from "@/components/PaymentDescriptionText";
import { sanitizeTransactionName } from "@/lib/normalize-transaction-name";

/**
 * Integração — Importação com rótulos LEGADOS.
 * ------------------------------------------------------------
 * Simula o fluxo completo de importação (CSV/PDF/OFX) contendo
 * descrições no formato antigo:
 *   "Pagamento (Total|Parcial) fatura cartão <Nome>"
 * e variações ruidosas (whitespace, NBSP, capitalização, acento,
 * "fatura do/da/de cartão", sufixo de parcela "(3/12)" etc.).
 *
 * Verifica que, independente do que estiver persistido, o
 * front-end SEMPRE renderiza o formato canônico:
 *   "Pagamento (Total|Parcial) cartão <Nome>"
 *
 * Cobre 3 camadas do pipeline:
 *   1. Sanitização na escrita (`sanitizeTransactionName`) — o que
 *      seria persistido em novos imports.
 *   2. Normalização em runtime (`PaymentDescriptionText`) — o que
 *      protege imports HISTÓRICOS que já escaparam para o banco.
 *   3. Renderização final no DOM — o que o usuário vê.
 */

// jsdom não implementa ResizeObserver; AutoFitText observa o container.
beforeAll(() => {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // @ts-expect-error - polyfill de teste
  globalThis.ResizeObserver = globalThis.ResizeObserver ?? RO;
});

afterEach(() => cleanup());

type ImportedRow = {
  id: string;
  /** Descrição bruta como veio do arquivo importado. */
  rawName: string;
  amount: number;
};

/** Simula a lista de linhas retornadas por um parser de CSV/PDF. */
const LEGACY_IMPORT_FIXTURES: ImportedRow[] = [
  // Variantes canônicas legadas
  { id: "1", rawName: "Pagamento Parcial fatura cartão Porto Bank", amount: -1000 },
  { id: "2", rawName: "Pagamento Total fatura cartão Mercado Pago", amount: -2500 },
  // "fatura do/da/de cartão"
  { id: "3", rawName: "Pagamento Parcial fatura do cartão Nubank", amount: -750 },
  { id: "4", rawName: "Pagamento Total fatura da cartão Itaú", amount: -1800 },
  { id: "5", rawName: "Pagamento Parcial fatura de cartão C6", amount: -500 },
  // "cartao" sem acento
  { id: "6", rawName: "Pagamento Parcial fatura cartao Inter", amount: -400 },
  // Capitalização mista
  { id: "7", rawName: "pagamento parcial FATURA CARTÃO XP", amount: -300 },
  // Whitespace ruidoso + NBSP
  { id: "8", rawName: "  Pagamento\u00A0Parcial   fatura  cartão   BTG  ", amount: -600 },
  // Sufixo de parcela agregado por engano
  { id: "9", rawName: "Pagamento Parcial fatura cartão Porto Bank (3/12)", amount: -200 },
  // Nome com hífen + acento
  { id: "10", rawName: "Pagamento Total fatura cartão Santander Free", amount: -1200 },
];

/**
 * Componente que reproduz o que uma view de importação renderiza:
 * uma lista mostrando as linhas parseadas via `PaymentDescriptionText`.
 */
function ImportPreview({ rows }: { rows: ImportedRow[] }) {
  return (
    <ul aria-label="Import Preview" data-testid="import-preview">
      {rows.map((r) => (
        <li key={r.id} data-testid="import-row" data-id={r.id}>
          <PaymentDescriptionText name={r.rawName} />
        </li>
      ))}
    </ul>
  );
}

function displayedRowTexts(): string[] {
  const list = screen.getByTestId("import-preview");
  return within(list)
    .getAllByTestId("import-row")
    .map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim());
}

describe("Importação com rótulos legados → renderização canônica", () => {
  it("nenhuma linha renderizada contém a string legada 'fatura cartão' / 'fatura do cartão' / 'fatura da cartão' / 'fatura de cartão'", () => {
    render(<ImportPreview rows={LEGACY_IMPORT_FIXTURES} />);
    const texts = displayedRowTexts();
    // Regex que detectaria QUALQUER resquício da wording legada, com ou sem acento e capitalização.
    const legacyRe = /pagamento\s+(parcial|total)\s+fatura\s+(do\s+|da\s+|de\s+)?cart[ãa]o/i;
    for (const t of texts) {
      expect(t, `Linha "${t}" contém wording legado`).not.toMatch(legacyRe);
    }
  });

  it("cada rótulo legado é substituído pela forma canônica 'Pagamento X cartão <Nome>'", () => {
    render(<ImportPreview rows={LEGACY_IMPORT_FIXTURES} />);
    const texts = displayedRowTexts();

    // Cada linha deve começar exatamente com "Pagamento Parcial cartão" ou "Pagamento Total cartão".
    const canonicalRe = /^Pagamento (Parcial|Total) cartão\s+.+/;
    for (const t of texts) {
      expect(t, `Linha "${t}" não está no formato canônico`).toMatch(canonicalRe);
    }
  });

  it("preserva o nome do cartão (Porto Bank, Mercado Pago, Nubank, Itaú, C6, Inter, XP, BTG, Santander Free)", () => {
    render(<ImportPreview rows={LEGACY_IMPORT_FIXTURES} />);
    const texts = displayedRowTexts();
    const expectedCardNames = [
      "Porto Bank",
      "Mercado Pago",
      "Nubank",
      "Itaú",
      "C6",
      "Inter",
      "XP",
      "BTG",
      "Santander Free",
    ];
    for (const card of expectedCardNames) {
      expect(
        texts.some((t) => t.includes(card)),
        `Nenhuma linha renderizada contém o nome "${card}"`,
      ).toBe(true);
    }
  });

  it("colapsa whitespace ruidoso e NBSP em espaço simples", () => {
    render(<ImportPreview rows={[LEGACY_IMPORT_FIXTURES[7]!]} />);
    const [text] = displayedRowTexts();
    expect(text).toBe("Pagamento Parcial cartão BTG");
    expect(text).not.toMatch(/\u00A0/);
    expect(text).not.toMatch(/ {2,}/);
  });

  it("normaliza capitalização mista para o formato canônico", () => {
    render(<ImportPreview rows={[LEGACY_IMPORT_FIXTURES[6]!]} />);
    const [text] = displayedRowTexts();
    expect(text).toBe("Pagamento Parcial cartão XP");
  });

  it("com `stripInstallmentSuffix` remove o sufixo '(N/M)' do fim da descrição", () => {
    const row = LEGACY_IMPORT_FIXTURES[8]!; // "... Porto Bank (3/12)"
    render(
      <ul data-testid="import-preview">
        <li data-testid="import-row">
          <PaymentDescriptionText name={row.rawName} stripInstallmentSuffix />
        </li>
      </ul>,
    );
    const [text] = displayedRowTexts();
    expect(text).toBe("Pagamento Parcial cartão Porto Bank");
    expect(text).not.toMatch(/\(\s*3\s*\/\s*12\s*\)/);
  });

  it("sem `stripInstallmentSuffix` mantém o sufixo '(N/M)'", () => {
    const row = LEGACY_IMPORT_FIXTURES[8]!;
    render(<ImportPreview rows={[row]} />);
    const [text] = displayedRowTexts();
    expect(text).toBe("Pagamento Parcial cartão Porto Bank (3/12)");
  });

  it("sanitizeTransactionName na escrita já persiste o formato canônico (defesa em profundidade)", () => {
    // A camada de escrita também deve reescrever o rótulo, garantindo
    // que novos imports não persistam a wording legada.
    for (const row of LEGACY_IMPORT_FIXTURES) {
      const sanitized = sanitizeTransactionName(row.rawName);
      expect(
        sanitized,
        `sanitizeTransactionName manteve wording legado em "${row.rawName}" → "${sanitized}"`,
      ).not.toMatch(/fatura\s+(do\s+|da\s+|de\s+)?cart[ãa]o/i);
      expect(sanitized).toMatch(/^Pagamento (Parcial|Total) cartão\s+.+/);
    }
  });

  it("fallback: mesmo se sanitização for burlada e o banco devolver o rótulo legado, a UI ainda renderiza canônico", () => {
    // Simula o pior caso: um registro histórico já persistiu no banco antes
    // da introdução do `sanitizeTransactionName`. A camada de UI é a última
    // linha de defesa e precisa continuar corrigindo em runtime.
    const persistedLegacy: ImportedRow[] = [
      { id: "H1", rawName: "Pagamento Parcial fatura cartão Legado A", amount: -100 },
      { id: "H2", rawName: "Pagamento Total fatura do cartão Legado B", amount: -200 },
    ];
    render(<ImportPreview rows={persistedLegacy} />);
    const texts = displayedRowTexts();
    expect(texts).toEqual([
      "Pagamento Parcial cartão Legado A",
      "Pagamento Total cartão Legado B",
    ]);
  });

  it("descrição vazia cai para fallback amigável e não renderiza wording legado espúrio", () => {
    render(
      <ul data-testid="import-preview">
        <li data-testid="import-row">
          <PaymentDescriptionText name="" />
        </li>
        <li data-testid="import-row">
          <PaymentDescriptionText name={null} />
        </li>
        <li data-testid="import-row">
          <PaymentDescriptionText name={undefined} />
        </li>
      </ul>,
    );
    const texts = displayedRowTexts();
    for (const t of texts) {
      expect(t).toBe("(sem descrição)");
      expect(t).not.toMatch(/fatura/i);
    }
  });
});
