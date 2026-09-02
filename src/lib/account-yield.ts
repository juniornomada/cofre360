import { parseCategoryValue } from "@/lib/categories";

export type AccountYieldTransaction = {
  name?: string | null;
  category?: string | null;
  type?: string | null;
  amount?: number | string | null;
};

export type AccountYieldComponent = "interest" | "fee";

export type YieldTransactionFields = {
  type: "income" | "expense";
  category: string;
  icon: string;
};

function normalizeLabel(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function inferYieldTransactionFields(
  name: string | null | undefined,
): YieldTransactionFields | null {
  const normalizedName = normalizeLabel(name);

  // Nomes inequívocos de rendimento: independentemente da aba/categoria que
  // estiver selecionada, o lançamento deve ser tratado como juros.
  if (/^(rendimentos?|juros?)(?:\b|\s|$)/.test(normalizedName)) {
    return { type: "income", category: "Receita > Juros", icon: "📈" };
  }

  // Quando o banco informa somente o desconto total, não inventamos a divisão.
  if (
    normalizedName.includes("ir/iof") ||
    normalizedName.includes("ir e iof") ||
    (normalizedName.includes("taxa") && (normalizedName.includes("resgate") || normalizedName.includes("cdb")))
  ) {
    return { type: "expense", category: "Impostos/Taxas > IR/IOF", icon: "📊" };
  }

  if (/\biof\b/.test(normalizedName)) {
    return { type: "expense", category: "Impostos/Taxas > IOF", icon: "🏛️" };
  }

  if (/^(ir|imposto de renda)(?:\b|\s|$)/.test(normalizedName)) {
    return { type: "expense", category: "Impostos/Taxas > IR", icon: "🏛️" };
  }

  return null;
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
        (parsedCategory.sub === "IR/IOF" || parsedCategory.sub === "IR" || parsedCategory.sub === "IOF" || parsedCategory.sub === "Taxas Bancárias")) ||
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
