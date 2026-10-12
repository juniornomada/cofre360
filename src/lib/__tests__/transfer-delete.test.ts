import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findPair: vi.fn(),
  deletePair: vi.fn(),
  deleteOrphan: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "transactions") throw new Error("Unexpected table");
      return {
        select: (columns: string) => {
          if (columns !== "id,type,category") throw new Error("Unexpected SELECT");
          return { eq: (column: string, group: string) => db.findPair(column, group) };
        },
        delete: () => ({
          in: (column: string, ids: string[]) => ({
            eq: (groupColumn: string, group: string) => ({
              select: (columns: string) => db.deletePair(column, ids, groupColumn, group, columns),
            }),
          }),
          eq: (idColumn: string, id: string) => ({
            eq: (groupColumn: string, group: string) => ({
              select: (columns: string) => db.deleteOrphan(idColumn, id, groupColumn, group, columns),
            }),
          }),
        }),
      };
    },
  },
}));

import { deleteTransferPair, OrphanedTransferError } from "@/lib/transfer-delete";

const validRows = [
  { id: "out", type: "expense", category: "Transferências > Outros" },
  { id: "in", type: "income", category: "Transferências > Outros" },
];

describe("exclusão financeira de transferência", () => {
  beforeEach(() => {
    db.findPair.mockReset().mockResolvedValue({ data: validRows, error: null });
    db.deletePair.mockReset().mockResolvedValue({
      data: [{ id: "out" }, { id: "in" }], error: null,
    });
    db.deleteOrphan.mockReset().mockResolvedValue({
      data: [{ id: "out" }], error: null,
    });
  });

  it("exclui entrada e saída com uma única instrução após confirmar o vínculo", async () => {
    await expect(deleteTransferPair({ id: "out", installment_group_id: "transfer-1" }))
      .resolves.toEqual({ deletedCount: 2 });
    expect(db.findPair).toHaveBeenCalledTimes(1);
    expect(db.findPair).toHaveBeenCalledWith("installment_group_id", "transfer-1");
    expect(db.deletePair).toHaveBeenCalledTimes(1);
    expect(db.deletePair).toHaveBeenCalledWith(
      "id", ["out", "in"], "installment_group_id", "transfer-1", "id",
    );
  });

  it("impede exclusão isolada quando falta o vínculo da transferência antiga", async () => {
    await expect(deleteTransferPair({ id: "out", installment_group_id: null }))
      .rejects.toThrow(/vínculo seguro/);
    expect(db.findPair).not.toHaveBeenCalled();
    expect(db.deletePair).not.toHaveBeenCalled();
  });

  it("identifica uma transferência órfã e exige confirmação adicional", async () => {
    db.findPair.mockResolvedValue({ data: [validRows[0]], error: null });
    await expect(deleteTransferPair({ id: "out", installment_group_id: "transfer-1" }))
      .rejects.toBeInstanceOf(OrphanedTransferError);
    expect(db.deletePair).not.toHaveBeenCalled();
    expect(db.deleteOrphan).not.toHaveBeenCalled();
  });

  it("exclui somente a ponta órfã após confirmação explícita", async () => {
    db.findPair.mockResolvedValue({ data: [validRows[0]], error: null });
    await expect(deleteTransferPair(
      { id: "out", installment_group_id: "transfer-1" },
      { allowOrphan: true },
    )).resolves.toEqual({ deletedCount: 1 });
    expect(db.deletePair).not.toHaveBeenCalled();
    expect(db.deleteOrphan).toHaveBeenCalledWith(
      "id", "out", "installment_group_id", "transfer-1", "id",
    );
  });

  it("revalida o grupo e não exclui apenas uma ponta se o par reapareceu", async () => {
    await expect(deleteTransferPair(
      { id: "out", installment_group_id: "transfer-1" },
      { allowOrphan: true },
    )).resolves.toEqual({ deletedCount: 2 });
    expect(db.deletePair).toHaveBeenCalledOnce();
    expect(db.deleteOrphan).not.toHaveBeenCalled();
  });

  it("não exclui uma ponta diferente da selecionada, mesmo com confirmação", async () => {
    db.findPair.mockResolvedValue({ data: [{ ...validRows[0], id: "unrelated" }], error: null });
    await expect(deleteTransferPair(
      { id: "out", installment_group_id: "transfer-1" },
      { allowOrphan: true },
    )).rejects.toThrow(/confirmar as duas pontas/);
    expect(db.deleteOrphan).not.toHaveBeenCalled();
  });

  it("não confirma sucesso se o DELETE da transferência órfã atingir zero linhas", async () => {
    db.findPair.mockResolvedValue({ data: [validRows[0]], error: null });
    db.deleteOrphan.mockResolvedValue({ data: [], error: null });
    await expect(deleteTransferPair(
      { id: "out", installment_group_id: "transfer-1" },
      { allowOrphan: true },
    )).rejects.toThrow(/não foi confirmada/);
  });

  it("propaga erro do banco na exclusão da transferência órfã", async () => {
    db.findPair.mockResolvedValue({ data: [validRows[0]], error: null });
    db.deleteOrphan.mockResolvedValue({ data: null, error: { message: "Falha na exclusão" } });
    await expect(deleteTransferPair(
      { id: "out", installment_group_id: "transfer-1" },
      { allowOrphan: true },
    )).rejects.toMatchObject({ message: "Falha na exclusão" });
  });

  it.each([
    ["três registros no grupo", [...validRows, { id: "extra", type: "expense", category: "Transferências > Outros" }]],
    ["duas saídas", [validRows[0], { ...validRows[1], type: "expense" }]],
    ["uma compra indevida no grupo", [validRows[0], { ...validRows[1], category: "Alimentação > Outros" }]],
    ["id selecionado não pertence ao grupo", [{ ...validRows[0], id: "other" }, validRows[1]]],
  ])("bloqueia %s sem excluir dados", async (_description, rows) => {
    db.findPair.mockResolvedValue({ data: rows, error: null });
    await expect(deleteTransferPair({ id: "out", installment_group_id: "transfer-1" }))
      .rejects.toThrow(/confirmar as duas pontas/);
    expect(db.deletePair).not.toHaveBeenCalled();
  });

  it("não executa DELETE se não conseguir consultar o par", async () => {
    db.findPair.mockResolvedValue({ data: null, error: { message: "Falha de leitura" } });
    await expect(deleteTransferPair({ id: "out", installment_group_id: "transfer-1" }))
      .rejects.toMatchObject({ message: "Falha de leitura" });
    expect(db.deletePair).not.toHaveBeenCalled();
  });

  it("não reporta sucesso quando DELETE retorna erro", async () => {
    db.deletePair.mockResolvedValue({ data: null, error: { message: "Falha ao excluir" } });
    await expect(deleteTransferPair({ id: "out", installment_group_id: "transfer-1" }))
      .rejects.toMatchObject({ message: "Falha ao excluir" });
  });

  it("não confirma exclusão com quantidade divergente de linhas", async () => {
    db.deletePair.mockResolvedValue({ data: [{ id: "out" }], error: null });
    await expect(deleteTransferPair({ id: "out", installment_group_id: "transfer-1" }))
      .rejects.toThrow(/não confirmou as duas pontas/);
  });
});
