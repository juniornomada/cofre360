import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("transaction edit delete action guard", () => {
  const source = readFileSync(resolve(process.cwd(), "src/routes/transactions.tsx"), "utf8");

  it("keeps a delete action inside the edit dialog footer", () => {
    expect(source).toContain("openDeleteFromEdit");
    expect(source).toContain('variant="destructive"');
    expect(source).toContain("<Trash2");
    expect(source).toContain("Excluir");
  });

  it("reuses the existing delete confirmation instead of deleting directly", () => {
    expect(source).toContain("setDeleteTarget(editTx)");
    expect(source).toContain("setShowDeleteDialog(true)");
    expect(source).toContain("handleDeleteConfirm");
  });

  it("returns to edit when deletion is cancelled", () => {
    expect(source).toContain("deleteOpenedFromEdit");
    expect(source).toContain("setShowEditDialog(true)");
  });
});
