import { parseCategoryValue } from "@/lib/categories";

export function matchesTransactionCategoryDrilldown(
  category: string | null | undefined,
  activeCategory: string,
  activeSubcategory?: string | null,
): boolean {
  const value = String(category || "");
  const parsed = parseCategoryValue(value);

  const groupMatches =
    activeCategory === "Todas" ||
    value === activeCategory ||
    parsed.group === activeCategory ||
    (activeCategory === "Transferências" &&
      (value === "Transferência" || value === "Transferências"));

  if (!groupMatches) return false;
  if (!activeSubcategory) return true;

  return parsed.sub === activeSubcategory;
}
