import { normalizeText } from "@/lib/utils";

export type ReusableTransactionHistoryEntry = {
  name: string;
  icon: string | null;
  category: string | null;
  card: string | null;
  bank_account_id: string | null;
  type: "income" | "expense";
  amount: number;
  date: string | null;
  created_at: string | null;
  transaction_kind?: string | null;
  is_visible?: boolean | null;
};

export function stripInstallmentSuffix(name: string): string {
  return String(name || "")
    .replace(/\s*\(\d+\/\d+\)\s*$/, "")
    .trim();
}

function normalizedName(name: string): string {
  return normalizeText(stripInstallmentSuffix(name))
    .replace(/\s+/g, " ")
    .trim();
}

function compactLetters(value: string): string {
  return value.replace(/[^a-z0-9]/g, "");
}

function acronym(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0] || "")
    .join("");
}

function consonantSkeleton(value: string): string {
  return compactLetters(value).replace(/[aeiou]/g, "");
}

function abbreviationMatch(candidate: string, query: string): boolean {
  const compactQuery = compactLetters(query);
  if (compactQuery.length < 2) return false;

  const candidateAcronym = acronym(candidate);
  if (candidateAcronym.length >= 2 && candidateAcronym.startsWith(compactQuery)) {
    return true;
  }

  return consonantSkeleton(candidate).startsWith(compactQuery);
}

function isReusable(entry: ReusableTransactionHistoryEntry): boolean {
  if (entry.is_visible === false) return false;
  if (entry.type !== "income" && entry.type !== "expense") return false;

  const kind = normalizeText(entry.transaction_kind || "").replace(/[_-]+/g, " ").trim();
  if (kind && kind !== "expense" && kind !== "income") return false;

  const category = normalizeText(entry.category || "");
  if (
    category.startsWith("transferencia") ||
    category.startsWith("transferencias") ||
    category.startsWith("pagamento de cartao") ||
    category.startsWith("pagamento do cartao") ||
    category.startsWith("pagamento cartao")
  ) {
    return false;
  }

  return !!normalizedName(entry.name);
}

export function dedupeReusableTransactionHistory(
  entries: ReusableTransactionHistoryEntry[],
): ReusableTransactionHistoryEntry[] {
  const latest = new Map<string, ReusableTransactionHistoryEntry>();

  for (const entry of entries) {
    if (!isReusable(entry)) continue;
    const baseName = stripInstallmentSuffix(entry.name);
    const key = `${entry.type}::${normalizedName(baseName)}`;
    if (latest.has(key)) continue;
    latest.set(key, { ...entry, name: baseName });
  }

  return [...latest.values()];
}

export function getTransactionHistorySuggestions(
  entries: ReusableTransactionHistoryEntry[],
  query: string,
  type: "income" | "expense",
  limit = 5,
): ReusableTransactionHistoryEntry[] {
  const normalizedQuery = normalizedName(query);
  if (normalizedQuery.length < 2) return [];

  const history = dedupeReusableTransactionHistory(entries)
    .filter((entry) => entry.type === type)
    .map((entry, index) => {
      const candidate = normalizedName(entry.name);
      const words = candidate.split(" ");
      const score = candidate.startsWith(normalizedQuery)
        ? 0
        : words.some((word) => word.startsWith(normalizedQuery))
          ? 1
          : candidate.includes(normalizedQuery)
            ? 2
            : abbreviationMatch(candidate, normalizedQuery)
              ? 3
              : 99;
      return { entry, score, index };
    })
    .filter((item) => item.score < 99)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, Math.max(0, limit));

  return history.map((item) => item.entry);
}

export function findExactTransactionHistoryMatch(
  entries: ReusableTransactionHistoryEntry[],
  name: string,
  type: "income" | "expense",
): ReusableTransactionHistoryEntry | null {
  const target = normalizedName(name);
  if (!target) return null;

  return (
    dedupeReusableTransactionHistory(entries).find(
      (entry) => entry.type === type && normalizedName(entry.name) === target,
    ) || null
  );
}
