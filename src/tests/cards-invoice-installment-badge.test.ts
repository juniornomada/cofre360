import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/routes/cards.tsx"), "utf8");

describe("invoice installment badge", () => {
  it("keeps installment progress visible outside the auto-fit transaction name", () => {
    expect(source).toContain('data-testid="invoice-installment-badge"');
    expect(source).toContain('{tx.installment_number}/{tx.total_installments}');
    expect(source).toContain('aria-label={`Parcela ${tx.installment_number} de ${tx.total_installments}`}');
  });
});
