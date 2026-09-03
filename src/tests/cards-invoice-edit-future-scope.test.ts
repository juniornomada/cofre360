import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("src/routes/cards.tsx", "utf8");

describe("invoice installment edit scope", () => {
  it("asks whether an installment edit applies to future installments", () => {
    expect(source).toContain("Aplicar alteração no parcelamento?");
    expect(source).toContain("Só esta parcela");
    expect(source).toContain("Esta e as futuras");
  });

  it("updates only installments from the current one forward", () => {
    expect(source).toContain('.gte("installment_number", current)');
    expect(source).toContain('addMonthsIso(editTx.date, n - current)');
    expect(source).toContain('performSaveEditTx("future")');
  });
});
