import { describe, it, expect } from "vitest";
import { getCategoryIcon } from "@/lib/categories";

/**
 * Resolução tolerante do ícone 💳 para "Pagamento de Cartão".
 * ----------------------------------------------------------------
 * Categorias podem chegar ao front-end vindas de importações OFX/CSV,
 * migrações históricas ou payloads externos com variações benignas:
 *   - espaços extras (duplos, tabs, NBSP)
 *   - capitalização diferente ("PAGAMENTO DE CARTÃO", "pagamento de cartão")
 *   - separador com whitespace irregular ("Pagamento de Cartão  >   Pagamento Total")
 *   - diacríticos removidos ("Pagamento de Cartao")
 *
 * `getCategoryIcon` DEVE resolver todos esses casos para 💳, sem cair
 * no fallback 📄. Este teste protege a heurística de normalização em
 * `src/lib/categories.ts` contra regressões.
 */

const CARD_ICON = "💳";
const FALLBACK_ICON = "📄";

const GROUP_VARIANTS = [
  "Pagamento de Cartão",
  "pagamento de cartão",
  "PAGAMENTO DE CARTÃO",
  "  Pagamento de Cartão  ",
  "Pagamento  de  Cartão", // espaços duplos internos
  "Pagamento\tde\tCartão", // tabs
  "Pagamento\u00A0de\u00A0Cartão", // NBSP
  "Pagamento de Cartao", // sem acento
  "pagamento DE cartao", // capitalização + sem acento
];

const SUB_VARIANTS: Array<[string, string]> = [
  ["Pagamento Total", "pagamento total"],
  ["Pagamento Total", "PAGAMENTO TOTAL"],
  ["Pagamento Total", "  Pagamento  Total  "],
  ["Pagamento Total", "Pagamento\u00A0Total"],
  ["Pagamento Parcial", "pagamento parcial"],
  ["Pagamento Parcial", "PAGAMENTO PARCIAL"],
  ["Pagamento Parcial", "Pagamento  Parcial"],
  ["Outros", "outros"],
  ["Outros", "OUTROS"],
];

const SEPARATOR_VARIANTS = [
  " > ",
  ">",
  "  >  ",
  " >\t",
  "\t>\t",
  " > ",
];

describe("getCategoryIcon — resolução tolerante para Pagamento de Cartão", () => {
  it.each(GROUP_VARIANTS)(
    "resolve 💳 para variação do grupo raiz: %j",
    (variant) => {
      expect(getCategoryIcon(variant)).toBe(CARD_ICON);
    },
  );

  it.each(
    GROUP_VARIANTS.flatMap((groupVariant) =>
      SUB_VARIANTS.map(([, subVariant]) => [groupVariant, subVariant] as const),
    ),
  )(
    "resolve 💳 para grupo=%j + subcategoria=%j (separador canônico)",
    (groupVariant, subVariant) => {
      const value = `${groupVariant} > ${subVariant}`;
      expect(getCategoryIcon(value)).toBe(CARD_ICON);
    },
  );

  it.each(SEPARATOR_VARIANTS)(
    "resolve 💳 quando o separador tem whitespace irregular: %j",
    (sep) => {
      expect(getCategoryIcon(`Pagamento de Cartão${sep}Pagamento Total`)).toBe(
        CARD_ICON,
      );
      expect(getCategoryIcon(`Pagamento de Cartão${sep}Pagamento Parcial`)).toBe(
        CARD_ICON,
      );
    },
  );

  it("combina todas as variações simultaneamente", () => {
    // grupo em CAPS sem acento + separador sem espaços + sub com NBSP
    const monstro = "PAGAMENTO DE CARTAO>Pagamento\u00A0PARCIAL";
    expect(getCategoryIcon(monstro)).toBe(CARD_ICON);
  });

  it("idempotência: valor canônico continua resolvendo para 💳", () => {
    expect(getCategoryIcon("Pagamento de Cartão")).toBe(CARD_ICON);
    expect(getCategoryIcon("Pagamento de Cartão > Pagamento Total")).toBe(CARD_ICON);
    expect(getCategoryIcon("Pagamento de Cartão > Pagamento Parcial")).toBe(CARD_ICON);
    expect(getCategoryIcon("Pagamento de Cartão > Outros")).toBe(CARD_ICON);
  });

  it("não confunde com categorias legítimas — não retorna 💳 para grupos alheios", () => {
    // Um grupo real diferente deve manter seu próprio ícone; não deve
    // ser sequestrado pelo normalizador tolerante.
    expect(getCategoryIcon("Outros")).toBe(FALLBACK_ICON);
    expect(getCategoryIcon("outros")).toBe(FALLBACK_ICON);
    expect(getCategoryIcon("  OUTROS  ")).toBe(FALLBACK_ICON);
  });

  it.each([
    "",
    "   ",
    "categoria inexistente",
    "Pagamento de Cartaozinho", // substring próxima, mas não igual
    "Pagamentos de Cartão", // plural — não é o grupo canônico
  ])("não faz match espúrio para entrada inválida: %j", (value) => {
    // Deve cair no fallback (📄), NÃO em 💳.
    expect(getCategoryIcon(value)).not.toBe(CARD_ICON);
  });

  it("retorna fallback para valores não-string sem lançar", () => {
    // Guard defensivo — nunca lançar em runtime, mesmo com entrada inválida
    // vinda de payloads externos (importações OFX/CSV, migrações, etc.).
    const unsafe = getCategoryIcon as unknown as (v: unknown) => string;
    expect(unsafe(undefined)).toBe(FALLBACK_ICON);
    expect(unsafe(null)).toBe(FALLBACK_ICON);
    expect(unsafe(123)).toBe(FALLBACK_ICON);
  });
});
