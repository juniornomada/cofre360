import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
    const iconEl = container.querySelector('span[role="img"]');
    expect(iconEl?.textContent).toBe(CARD_ICON);
    expect(iconEl?.textContent).not.toBe("📄");
  });
});
