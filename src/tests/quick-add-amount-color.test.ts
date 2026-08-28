import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("QuickAdd amount color by transaction type", () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/QuickAddTransactionDialog.tsx"),
    "utf8",
  );

  it("uses red for expenses and green for income", () => {
    expect(source).toContain('newTx.type === "expense" ? "!text-red-500" : "!text-green-600 dark:!text-green-500"');
  });

  it("uses neutral black/light and white/dark for transfers", () => {
    expect(source).toContain('className="!text-black dark:!text-white"');
  });
});
