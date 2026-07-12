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
 * Cobertura de fallback do ícone em TransactionItem.
 *
 * O componente resolve o ícone via:
 *   displayIcon = getCategoryIcon(category) || icon
 *
 * `getCategoryIcon` retorna:
 *   1. Ícone da subcategoria se encontrada.
 *   2. Ícone do grupo se a subcategoria não existir mas o grupo sim.
 *   3. "📄" (fallback padrão) se o grupo não existir.
 *
 * Estes testes garantem que, quando a categoria NÃO é "Pagamento de Cartão"
 * (nem uma categoria válida do `categoryTree`), o ícone padrão "📄" aparece
 * corretamente — e nunca vaza para 💳 por engano.
 */

const FALLBACK_ICON = "📄";
const CARD_ICON = "💳";

const INVALID_CATEGORIES = [
  "",
  "   ",
  "Categoria Inexistente",
  "Pagamento Cartão", // faltando "de" — não deve casar
  "pagamento de cartão", // capitalização errada
  "Pagamento de Cartão XPTO", // sufixo espúrio no nome do grupo
  "Random > Subcategoria",
  ">",
  " > Pagamento Total",
];

function renderItem(category: string, iconProp: string = FALLBACK_ICON) {
  return render(
    <TransactionItem
      icon={iconProp}
      name="Compra genérica"
      category={category}
      date="2025-07-10"
      amount={100}
      type="expense"
    />,
  );
}

describe("TransactionItem — fallback de ícone quando a categoria é inválida/ausente", () => {
  it("getCategoryIcon devolve '📄' para todas as categorias inválidas cobertas", () => {
    for (const c of INVALID_CATEGORIES) {
      expect(getCategoryIcon(c), `Categoria "${c}" deveria cair no fallback`).toBe(
        FALLBACK_ICON,
      );
      // Reforço: NUNCA deve vazar para 💳.
      expect(getCategoryIcon(c)).not.toBe(CARD_ICON);
    }
  });

  it.each(INVALID_CATEGORIES)(
    "renderiza o ícone '📄' no DOM para categoria inválida %j",
    (category) => {
      const { container, unmount } = renderItem(category);
      const iconEls = Array.from(
        container.querySelectorAll<HTMLSpanElement>('span[role="img"]'),
      ).filter((el) => !el.hasAttribute("aria-hidden"));
      expect(iconEls.length).toBeGreaterThan(0);
      const iconEl = iconEls[0]!;
      expect(iconEl.textContent).toBe(FALLBACK_ICON);
      expect(iconEl.textContent).not.toBe(CARD_ICON);
      unmount();
    },
  );

  it("a11y: aria-label reflete a categoria bruta mesmo quando inválida", () => {
    const category = "Categoria Inexistente";
    const { container } = renderItem(category);
    const iconEl = container.querySelector<HTMLSpanElement>(
      `span[role="img"][aria-label="${category}"]`,
    );
    expect(iconEl).not.toBeNull();
    expect(iconEl!.textContent).toBe(FALLBACK_ICON);
    expect(iconEl!.getAttribute("role")).toBe("img");
  });

  it("quando getCategoryIcon retorna fallback '📄', o valor da categoria válida do tree ainda é priorizado sobre o prop `icon`", () => {
    // Categoria inválida → getCategoryIcon devolve "📄" (truthy) → prop `icon`
    // não é usado. Isso documenta o comportamento atual: displayIcon nunca cai
    // no prop `icon` porque o fallback do tree ("📄") é sempre truthy.
    const { container } = renderItem("Categoria Inexistente", "🎯");
    const iconEl = container.querySelector<HTMLSpanElement>(
      'span[role="img"]:not([aria-hidden="true"])',
    );
    expect(iconEl!.textContent).toBe(FALLBACK_ICON);
    expect(iconEl!.textContent).not.toBe("🎯");
  });

  it("categoria com grupo válido mas subcategoria inexistente usa o ícone do GRUPO (não o fallback global)", () => {
    // "Pagamento de Cartão > SubcategoriaFantasma" → grupo existe (ícone 💳),
    // subcategoria não existe → getCategoryIcon retorna o ícone do grupo.
    const iconGroupOnly = getCategoryIcon("Pagamento de Cartão > SubcategoriaFantasma");
    expect(iconGroupOnly).toBe(CARD_ICON);

    const { container } = renderItem("Pagamento de Cartão > SubcategoriaFantasma");
    const iconEl = container.querySelector<HTMLSpanElement>(
      'span[role="img"]:not([aria-hidden="true"])',
    );
    expect(iconEl!.textContent).toBe(CARD_ICON);
  });

  it("null/undefined castados para string vazia caem no fallback '📄'", () => {
    // TypeScript não permite passar null/undefined direto, mas em runtime
    // pode acontecer (ex.: dados legados). Simulamos via `as unknown`.
    expect(getCategoryIcon("" as unknown as string)).toBe(FALLBACK_ICON);
    const { container } = renderItem("");
    const iconEl = container.querySelector<HTMLSpanElement>(
      'span[role="img"]:not([aria-hidden="true"])',
    );
    expect(iconEl!.textContent).toBe(FALLBACK_ICON);
  });
});
