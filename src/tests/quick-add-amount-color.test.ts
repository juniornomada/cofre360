import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("QuickAdd amount color by transaction type", () => {
  const dialogSource = fs.readFileSync(path.resolve(process.cwd(), "src/components/QuickAddTransactionDialog.tsx"), "utf8");
  const inputSource = fs.readFileSync(path.resolve(process.cwd(), "src/components/CalculatorAmountInput.tsx"), "utf8");

  it("passes the active transaction type to the amount field", () => {
    expect(dialogSource).toContain('tone={newTx.type}');
  });

  it("uses an explicit transfer tone", () => {
    expect(dialogSource).toContain('tone="transfer"');
  });

  it("maps expense, income and transfer to distinct text and border colors", () => {
    expect(inputSource).toContain('tone === "expense"');
    expect(inputSource).toContain('!text-red-500 !border-red-500');
    expect(inputSource).toContain('tone === "income"');
    expect(inputSource).toContain('!text-green-600 dark:!text-green-500 !border-green-600 dark:!border-green-500');
    expect(inputSource).toContain('tone === "transfer"');
    expect(inputSource).toContain('!text-black dark:!text-white !border-black dark:!border-white');
  });
});
