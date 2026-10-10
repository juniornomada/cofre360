import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/routes/transactions.tsx"), "utf8");

describe("/transactions default monthly source", () => {
  it("opens with all sources, without restoring a stale source or account from localStorage", () => {
    const from = source.indexOf('const [activeSource, setActiveSource]');
    const to = source.indexOf('useEffect(() => {', from);
    const defaults = source.slice(from, to);
    expect(defaults).toContain('searchParams.accountId ? "account" : "all"');
    expect(defaults).toContain('searchParams.accountId || null');
    expect(defaults).not.toContain('localStorage.getItem("transactions_filter_source")');
    expect(defaults).not.toContain('localStorage.getItem("transactions_filter_accountId")');
  });

  it("uses the monthly credit purchase ledger only for the default all-sources view", () => {
    expect(source).toContain('includeMissingMonthlyCardPurchases(rawFiltered, categoryListTransactions)');
    expect(source).toContain('isYieldView || activeSource !== "all" || filterAccountId');
    expect(source).toContain('categoryScopeActive\n    ? categoryListTransactions');
  });
});
