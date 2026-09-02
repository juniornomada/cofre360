import { parseCategoryValue } from "@/lib/categories";

export type AccountYieldTransaction = {
  name?: string | null;
  category?: string | null;
  type?: string | null;
  amount?: number | string | null;
};

export type AccountYieldComponent = "interest" | "fee";

function normalizeLabel(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function classifyAccountYieldTransaction(
  tx: AccountYieldTransaction,
): AccountYieldComponent | null {
  const parsedCategory = parseCategoryValue(String(tx.category || ""));
  const normalizedName = normalizeLabel(tx.name);

  const isInterestIncome =
    tx.type === "income" &&
    parsedCategory.group === "Receita" &&
    parsedCategory.sub === "Juros";

  if (isInterestIncome) return "interest";

  const isInvestmentFee =
    tx.type === "expense" && (
      (parsedCategory.group === "Impostos/Taxas" &&
        (parsedCategory.sub === "IR" || parsedCategory.sub === "Taxas Bancárias")) ||
      /\biof\b/.test(normalizedName) ||
      /\bir\b/.test(normalizedName) ||
      normalizedName.includes("imposto de renda")
    );

  return isInvestmentFee ? "fee" : null;
}

export function isAccountYieldComponent(tx: AccountYieldTransaction) {
  return classifyAccountYieldTransaction(tx) !== null;
}

export function accountYieldDeltaCents(tx: AccountYieldTransaction) {
  const component = classifyAccountYieldTransaction(tx);
  if (!component) return 0;

  const amountCents = Math.round((Number(tx.amount) || 0) * 100);
  return component === "interest" ? amountCents : -amountCents;
}
