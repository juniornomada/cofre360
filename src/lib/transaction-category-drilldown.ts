import { parseCategoryValue } from "@/lib/categories";

export function matchesTransactionCategoryFilter(
  category: string,
  activeCategory: string,
  activeSubcategory: string | null | undefined,
): boolean {
  const parsed = parseCategoryValue(category || "");
  const groupMatches =
    activeCategory === "Todas" ||
    category === activeCategory ||
    parsed.group === activeCategory ||
    (activeCategory === "Transferências" &&
      (category === "Transferência" || category === "Transferências"));

  if (!groupMatches) return false;
  if (!activeSubcategory) return true;

  return parsed.sub === activeSubcategory;
}
