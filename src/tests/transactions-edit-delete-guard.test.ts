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

  it("validates the exact transfer pair before performing either edit update", () => {
    const saveStart = source.indexOf("const handleSaveEdit = async");
    const fromUpdate = source.indexOf('name: transferNames.outgoing', saveStart);
    const guard = source.indexOf("isCompleteTransferEditPair(pairRows || [], editTx.id)", saveStart);
    expect(guard).toBeGreaterThan(saveStart);
    expect(fromUpdate).toBeGreaterThan(guard);
    expect(source).toContain("Nenhum lançamento foi alterado.");
  });

  it("deletes complete transfer pairs through the validated helper", () => {
    expect(source).toContain("isTransferTransaction(deleteTarget)");
    expect(source).toContain("deleteTransferPair(deleteTarget, { allowOrphan: confirmOrphanTransferDeletion })");
    expect(source).toContain("Transferências completas são excluídas pelas duas pontas");
  });

  it("requires a separate, explicit confirmation for a verified orphaned transfer", () => {
    expect(source).toContain("e instanceof OrphanedTransferError");
    expect(source).toContain("setConfirmOrphanTransferDeletion(true)");
    expect(source).toContain("Excluir somente este lançamento");
    expect(source).toContain("O banco confirmou que somente este lançamento permanece no grupo");
    expect(source).toContain("setConfirmOrphanTransferDeletion(false)");
  });

  it("blocks batch deletion whenever the selection contains a bank transfer", () => {
    expect(source).toContain("filtered.some((tx) => selectedIds.has(tx.id) && isTransferTransaction(tx))");
    expect(source).toContain("exclua transferências individualmente");
  });

  it("prevents repeat taps while an orphan transfer is being checked/deleted", () => {
    expect(source).toContain("if (!deleteTarget || deletingSingleTransaction) return;");
    expect(source).toContain("setDeletingSingleTransaction(true)");
    expect(source).toContain("setDeletingSingleTransaction(false)");
    expect(source).toContain('disabled={deletingSingleTransaction}');
    expect(source).toContain("Verificando exclusão...");
    expect(source).toContain("Excluir somente este lançamento");
  });

  it("keeps the deletion confirmation open if validation or deletion fails", () => {
    expect(source).toContain("let deletedSuccessfully = false");
    expect(source).toContain("if (deletedSuccessfully) {");
  });
});
