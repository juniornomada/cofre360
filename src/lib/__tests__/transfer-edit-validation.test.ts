import { describe, expect, it } from "vitest";
import { isCompleteTransferEditPair, type TransferEditRow } from "@/lib/transfer-edit-validation";

const rows: TransferEditRow[] = [
  { id: "out", type: "expense", category: "Transferências > Outros" },
  { id: "in", type: "income", category: "Transferências > Outros" },
];

describe("transfer edit — financial pair integrity", () => {
  it.each(["out", "in"])("accepts both transfer legs as selected row (%s)", (selected) => {
    expect(isCompleteTransferEditPair(rows, selected)).toBe(true);
  });

  it("accepts recognized legacy transfer categories", () => {
    expect(isCompleteTransferEditPair([
      { ...rows[0], category: "Transferência" },
      { ...rows[1], category: "Transferências" },
    ], "out")).toBe(true);
  });

  it.each([
    ["zero rows", []],
    ["single outgoing leg", [rows[0]]],
    ["three rows", [...rows, { ...rows[0], id: "other" }]],
    ["two outgoing legs", [rows[0], { ...rows[1], type: "expense" }]],
    ["two incoming legs", [{ ...rows[0], type: "income" }, rows[1]]],
    ["unrelated expense in group", [rows[0], { ...rows[1], category: "Alimentação > Outros" }]],
    ["duplicate transaction IDs", [rows[0], { ...rows[1], id: "out" }]],
    ["unrecognized prefix", [rows[0], { ...rows[1], category: "Transferência Bancária" }]],
  ] satisfies Array<[string, TransferEditRow[]]>)("rejects %s without guessing a matching transfer", (_, candidateRows) => {
    expect(isCompleteTransferEditPair(candidateRows, "out")).toBe(false);
  });

  it("rejects a selected transaction ID absent from an otherwise valid pair", () => {
    expect(isCompleteTransferEditPair(rows, "unrelated")).toBe(false);
  });
});
