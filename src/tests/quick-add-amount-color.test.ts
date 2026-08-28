import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("QuickAdd amount color by transaction type", () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/QuickAddTransactionDialog.tsx"),
    "utf8",
  );

  it("uses red for expenses and green for income", () => {
    expect(source).toContain('newTx.type === "expense" ? "!text-red-500 !border-red-500 focus-visible:!ring-red-500" : "!text-green-600 dark:!text-green-500 !border-green-600 dark:!border-green-500 focus-visible:!ring-green-600 dark:focus-visible:!ring-green-500"');
  });

  it("uses neutral black/light and white/dark for transfers", () => {
    expect(source).toContain('className="!text-black dark:!text-white !border-black dark:!border-white focus-visible:!ring-black dark:focus-visible:!ring-white"');
  });
});
