import { describe, it, expect, beforeAll } from "vitest";
import { render } from "@testing-library/react";

// jsdom não implementa ResizeObserver — AutoFitText (usado por TransactionItem)
// depende dele. Instala um stub inerte antes de montar o componente.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    class RO {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
  }
});

import { TransactionItem } from "@/components/TransactionItem";
import { getCategoryIcon } from "@/lib/categories";

/**
 * Garante que TransactionItem renderiza o ícone 💳 quando a categoria da
 * transação é "Pagamento de Cartão" (grupo raiz ou subcategorias). O ícone
 * é derivado de `getCategoryIcon`, que consulta o `categoryTree` em
 * `src/lib/categories.ts`. Se o grupo "Pagamento de Cartão" for removido
 * ou tiver seu ícone alterado, este teste falha explicitamente.
 */

const CARD_ICON = "💳";

function renderItem(category: string) {
  return render(
    <TransactionItem
      icon="📄"
      name="Pagamento cartão Porto Bank"
      category={category}
      date="2025-07-10"
      amount={1000}
      type="expense"
    />
  );
}

describe("TransactionItem — ícone de Pagamento de Cartão", () => {
  it("resolve o ícone 💳 via getCategoryIcon para o grupo e subcategorias", () => {
    expect(getCategoryIcon("Pagamento de Cartão > Pagamento Total")).toBe(CARD_ICON);
    expect(getCategoryIcon("Pagamento de Cartão > Pagamento Parcial")).toBe(CARD_ICON);
    expect(getCategoryIcon("Pagamento de Cartão > Outros")).toBe(CARD_ICON);
    expect(getCategoryIcon("Pagamento de Cartão")).toBe(CARD_ICON);
  });

  it.each([
    ["Pagamento de Cartão > Pagamento Total"],
    ["Pagamento de Cartão > Pagamento Parcial"],
    ["Pagamento de Cartão > Outros"],
  ])("renderiza 💳 no DOM para %s", (category) => {
    const { container, unmount } = renderItem(category);
    // O ícone é renderizado dentro de <span role="img" aria-label={category}>
    const iconEl = container.querySelector(`span[role="img"][aria-label="${category}"]`);
    expect(iconEl).not.toBeNull();
    expect(iconEl!.textContent).toBe(CARD_ICON);
    unmount();
  });

  it.each([
    ["Pagamento de Cartão"],
    ["Pagamento de Cartão > Pagamento Total"],
    ["Pagamento de Cartão > Pagamento Parcial"],
    ["Pagamento de Cartão > Outros"],
  ])(
    "a11y: o ícone renderizado tem role=\"img\" e aria-label exatamente igual à categoria (%s)",
    (category) => {
      const { container, unmount } = renderItem(category);

      // Localiza o ícone da categoria (o span do menu de transferência usa
      // aria-hidden="true" e é filtrado abaixo).
      const iconEls = Array.from(
        container.querySelectorAll<HTMLSpanElement>('span[role="img"]'),
      ).filter((el) => !el.hasAttribute("aria-hidden"));

      expect(iconEls.length).toBeGreaterThan(0);
      const categoryIcon = iconEls[0]!;

      // Asserção principal: o aria-label é a categoria completa, permitindo
      // que leitores de tela anunciem "Pagamento de Cartão > Pagamento Total".
      expect(categoryIcon.getAttribute("aria-label")).toBe(category);
      expect(categoryIcon.getAttribute("role")).toBe("img");
      expect(categoryIcon.textContent).toBe(CARD_ICON);

      // Garante que o ícone NÃO está marcado como decorativo — leitores de
      // tela DEVEM anunciar a categoria associada.
      expect(categoryIcon.getAttribute("aria-hidden")).not.toBe("true");

      unmount();
    },
  );

  it("prefere o ícone da categoria em vez do prop `icon` fornecido", () => {
    // Passa um ícone genérico via prop — o componente deve ignorá-lo em favor
    // do ícone canônico derivado da categoria "Pagamento de Cartão".
    const { container } = render(
      <TransactionItem
        icon="📄"
        name="Pagamento Parcial cartão Porto Bank"
        category="Pagamento de Cartão > Pagamento Parcial"
        date="2025-07-10"
        amount={1000}
        type="expense"
      />
    );
    const iconEl = container.querySelector(
      'span[role="img"][aria-label="Pagamento de Cartão > Pagamento Parcial"]',
    );
    expect(iconEl).not.toBeNull();
    expect(iconEl!.textContent).toBe(CARD_ICON);
    expect(iconEl!.textContent).not.toBe("📄");
    // Reforço a11y: o aria-label reflete a categoria — não o ícone bruto.
    expect(iconEl!.getAttribute("aria-label")).toBe(
      "Pagamento de Cartão > Pagamento Parcial",
    );
  });
});
