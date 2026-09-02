from pathlib import Path

# 1) transactions.tsx
p = Path("src/routes/transactions.tsx")
s = p.read_text()

state_anchor = '  const [editInstallmentMode, setEditInstallmentMode] = useState<"divide" | "fixed">("divide");\n'
if 'editOriginalInstallmentNumber' not in s:
    s = s.replace(
        state_anchor,
        state_anchor + '  const [editOriginalInstallmentNumber, setEditOriginalInstallmentNumber] = useState<number | null>(null);\n',
        1,
    )

transfer_anchor = '      setEditInstallmentMode("divide");\n      setEditNameMode("none");\n'
if 'setEditOriginalInstallmentNumber(null);' not in s:
    s = s.replace(
        transfer_anchor,
        '      setEditInstallmentMode("divide");\n      setEditOriginalInstallmentNumber(null);\n      setEditNameMode("none");\n',
        1,
    )

effective_anchor = '    const effectiveTx = { ...tx, ...installmentSeed };\n'
if 'setEditOriginalInstallmentNumber(' not in s[s.index(effective_anchor):s.index(effective_anchor)+500]:
    s = s.replace(
        effective_anchor,
        effective_anchor + '    setEditOriginalInstallmentNumber(\n      Number(effectiveTx.installment_number) > 0 ? Number(effectiveTx.installment_number) : null,\n    );\n',
        1,
    )

validation_anchor = '    const total = Math.max(1, Math.floor(Number(editTx.total_installments)));\n    const current = Math.max(1, Math.min(total, Math.floor(Number(editTx.installment_number) || 1)));\n'
validation_replacement = '''    const total = Math.max(1, Math.floor(Number(editTx.total_installments)));
    const rawCurrent = Number(editTx.installment_number);
    if (total > 1 && (!Number.isFinite(rawCurrent) || !Number.isInteger(rawCurrent) || rawCurrent < 1 || rawCurrent > total)) {
      toast.error(`Informe uma parcela atual válida entre 1 e ${total}.`);
      return;
    }
    const current = total > 1 ? rawCurrent : 1;
'''
if validation_anchor in s:
    s = s.replace(validation_anchor, validation_replacement, 1)
elif 'Informe uma parcela atual válida entre 1 e ${total}.' not in s:
    raise SystemExit('validation anchor not found')

save_anchor = '            current,\n            total,\n            installmentAmount: perInstallment,\n'
if 'originalCurrent: editOriginalInstallmentNumber ?? current,' not in s:
    s = s.replace(
        save_anchor,
        '            current,\n            originalCurrent: editOriginalInstallmentNumber ?? current,\n            total,\n            installmentAmount: perInstallment,\n',
        1,
    )

ui_anchor = '''                {(Number(editTx.total_installments) || 1) > 1 && (
                  <>
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">Modo de cálculo</label>
'''
ui_replacement = '''                {(Number(editTx.total_installments) || 1) > 1 && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-muted-foreground block">Parcela atual <span className="font-normal">(lançar a partir de)</span></label>
                      <div className="grid grid-cols-[48px_1fr_48px] items-center gap-2">
                        <button
                          type="button"
                          aria-label="Diminuir parcela atual"
                          onClick={() => {
                            const total = Math.max(1, Number(editTx.total_installments) || 1);
                            const current = Math.max(1, Math.min(total, Number(editTx.installment_number) || 1));
                            setEditTx({ ...editTx, installment_number: Math.max(1, current - 1) });
                          }}
                          disabled={(Number(editTx.installment_number) || 1) <= 1}
                          className="h-10 rounded-xl border border-border bg-background text-lg font-bold text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={Number(editTx.total_installments) || 1}
                          value={editTx.installment_number ?? ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            setEditTx({ ...editTx, installment_number: value === "" ? null : Number(value) });
                          }}
                          aria-label="Parcela atual"
                          className="h-10 min-w-0 rounded-xl border border-border bg-background px-3 text-center text-sm font-bold tabular-nums text-foreground outline-none focus:border-primary/60"
                        />
                        <button
                          type="button"
                          aria-label="Aumentar parcela atual"
                          onClick={() => {
                            const total = Math.max(1, Number(editTx.total_installments) || 1);
                            const current = Math.max(1, Math.min(total, Number(editTx.installment_number) || 1));
                            setEditTx({ ...editTx, installment_number: Math.min(total, current + 1) });
                          }}
                          disabled={(Number(editTx.installment_number) || 1) >= (Number(editTx.total_installments) || 1)}
                          className="h-10 rounded-xl border border-primary/40 bg-primary/10 text-lg font-bold text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          +
                        </button>
                      </div>
                      <p className="text-[9px] leading-relaxed text-muted-foreground">
                        Ex.: altere 3 de 4 para 2 de 4. A sequência futura e as datas serão corrigidas automaticamente.
                      </p>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">Modo de cálculo</label>
'''
if ui_anchor in s:
    s = s.replace(ui_anchor, ui_replacement, 1)
elif 'aria-label="Parcela atual"' not in s:
    raise SystemExit('installment UI anchor not found')

p.write_text(s)

# 2) installment-edit.ts
p = Path("src/lib/installment-edit.ts")
s = p.read_text()

# Support editor dd-MM-yyyy dates when rebuilding a sequence.
parse_anchor = '''  const iso = trimmed.match(/^(\\d{4})-(\\d{2})-(\\d{2})/);
  if (iso) return new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
  const parts = trimmed.toLowerCase().split(/\\s+/);
'''
parse_replacement = '''  const iso = trimmed.match(/^(\\d{4})-(\\d{2})-(\\d{2})/);
  if (iso) return new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
  const br = trimmed.match(/^(\\d{2})-(\\d{2})-(\\d{4})$/);
  if (br) return new Date(parseInt(br[3], 10), parseInt(br[2], 10) - 1, parseInt(br[1], 10));
  const parts = trimmed.toLowerCase().split(/\\s+/);
'''
if parse_anchor in s:
    s = s.replace(parse_anchor, parse_replacement, 1)

format_anchor = '''  if (/^\\d{4}-\\d{2}-\\d{2}/.test(original.trim())) {
    const yyyy = target.getFullYear();
    const mm = String(target.getMonth() + 1).padStart(2, "0");
    const dd = String(target.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  const dd = String(target.getDate()).padStart(2, "0");
'''
format_replacement = '''  if (/^\\d{4}-\\d{2}-\\d{2}/.test(original.trim())) {
    const yyyy = target.getFullYear();
    const mm = String(target.getMonth() + 1).padStart(2, "0");
    const dd = String(target.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (/^\\d{2}-\\d{2}-\\d{4}$/.test(original.trim())) {
    const yyyy = target.getFullYear();
    const mm = String(target.getMonth() + 1).padStart(2, "0");
    const dd = String(target.getDate()).padStart(2, "0");
    return `${dd}-${mm}-${yyyy}`;
  }
  const dd = String(target.getDate()).padStart(2, "0");
'''
if format_anchor in s:
    s = s.replace(format_anchor, format_replacement, 1)

input_anchor = '  current: number;\n  total: number;\n'
if 'originalCurrent?: number;' not in s:
    s = s.replace(input_anchor, '  current: number;\n  originalCurrent?: number;\n  total: number;\n', 1)

helper_anchor = 'export type SaveInstallmentResult = { futureRowsAdded: number; cleared: boolean };\n\n'
helper = '''export type InstallmentCurrentCorrectionPlan = {
  desiredNumbers: number[];
  reusableOtherCount: number;
  insertNumbers: number[];
  deleteOtherNumbers: number[];
  conflict: string | null;
};

export function buildInstallmentCurrentCorrectionPlan(
  otherInstallmentNumbers: number[],
  originalCurrent: number,
  newCurrent: number,
  total: number,
): InstallmentCurrentCorrectionPlan {
  const normalizedTotal = Math.max(1, Math.floor(Number(total) || 1));
  const original = Math.max(1, Math.floor(Number(originalCurrent) || 1));
  const current = Math.max(1, Math.floor(Number(newCurrent) || 1));
  const others = otherInstallmentNumbers
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1)
    .sort((a, b) => a - b);
  const prefix = others.filter((n) => n < original);
  const maxPrefix = prefix.length > 0 ? Math.max(...prefix) : 0;
  const desiredNumbers = Array.from(
    { length: Math.max(0, normalizedTotal - current + 1) },
    (_, index) => current + index,
  );

  if (current > normalizedTotal) {
    return { desiredNumbers: [], reusableOtherCount: 0, insertNumbers: [], deleteOtherNumbers: [], conflict: "Parcela atual maior que o total." };
  }
  if (maxPrefix >= current) {
    return {
      desiredNumbers,
      reusableOtherCount: 0,
      insertNumbers: [],
      deleteOtherNumbers: [],
      conflict: `Já existe a parcela ${current}/${normalizedTotal} antes desta transação.`,
    };
  }

  const tailOthers = others.filter((n) => n >= original);
  const desiredAfterAnchor = desiredNumbers.slice(1);
  const reusableOtherCount = Math.min(tailOthers.length, desiredAfterAnchor.length);
  return {
    desiredNumbers,
    reusableOtherCount,
    insertNumbers: desiredAfterAnchor.slice(reusableOtherCount),
    deleteOtherNumbers: tailOthers.slice(reusableOtherCount),
    conflict: null,
  };
}

'''
if 'buildInstallmentCurrentCorrectionPlan' not in s:
    s = s.replace(helper_anchor, helper_anchor + helper, 1)

update_anchor = '''  const updateData = {
    name: baseName,
    amount: perInstallment,
    installment_number: current,
    total_installments: total,
    installment_group_id: groupId,
    installment_mode: input.installmentMode || "divide",
    installment_source_amount: input.installmentSourceAmount ?? perInstallment,
    icon: input.icon,
    category: input.category,
    card: input.card,
    bank_account_id: input.bank_account_id,
  };

  if (input.updateAllInGroup && input.installment_group_id) {
'''
update_replacement = '''  const updateData = {
    name: baseName,
    amount: perInstallment,
    installment_number: current,
    total_installments: total,
    installment_group_id: groupId,
    installment_mode: input.installmentMode || "divide",
    installment_source_amount: input.installmentSourceAmount ?? perInstallment,
    icon: input.icon,
    category: input.category,
    card: input.card,
    bank_account_id: input.bank_account_id,
  };

  const originalCurrent = Math.max(1, Math.floor(Number(input.originalCurrent) || current));
  if (input.installment_group_id && originalCurrent !== current) {
    const { data: groupRows, error: groupError } = await supabase
      .from("transactions")
      .select("id, installment_number")
      .eq("installment_group_id", groupId);
    if (groupError) throw groupError;

    const anchor = (groupRows || []).find((row: any) => row.id === input.id);
    if (!anchor) throw new Error("Não foi possível localizar a parcela atual no grupo.");

    const otherRows = (groupRows || [])
      .filter((row: any) => row.id !== input.id)
      .map((row: any) => ({ id: row.id as string, number: Number(row.installment_number) || 0 }))
      .sort((a, b) => a.number - b.number);
    const plan = buildInstallmentCurrentCorrectionPlan(
      otherRows.map((row) => row.number),
      originalCurrent,
      current,
      total,
    );
    if (plan.conflict) throw new Error(plan.conflict);

    const prefixRows = otherRows.filter((row) => row.number < originalCurrent);
    const tailRows = otherRows.filter((row) => row.number >= originalCurrent);

    // Keep earlier installments intact, but keep shared plan metadata coherent.
    for (const row of prefixRows) {
      const { error } = await supabase.from("transactions").update({
        total_installments: total,
        installment_mode: input.installmentMode || "divide",
        installment_source_amount: input.installmentSourceAmount ?? perInstallment,
        name: baseName,
        amount: perInstallment,
        icon: input.icon,
        category: input.category,
        card: input.card,
        bank_account_id: input.bank_account_id,
      }).eq("id", row.id);
      if (error) throw error;
    }

    const reusableRows = tailRows.slice(0, plan.reusableOtherCount);
    const desiredNumbers = plan.desiredNumbers;
    const anchorUpdate = {
      ...updateData,
      installment_number: desiredNumbers[0],
      date: input.date,
      type: input.type,
    };
    const { error: anchorError } = await supabase.from("transactions").update(anchorUpdate).eq("id", input.id);
    if (anchorError) throw anchorError;

    for (let index = 0; index < reusableRows.length; index++) {
      const desiredNumber = desiredNumbers[index + 1];
      const { error } = await supabase.from("transactions").update({
        ...updateData,
        installment_number: desiredNumber,
        date: addMonthsKeepingFormat(input.date, index + 1),
        type: input.type,
      }).eq("id", reusableRows[index].id);
      if (error) throw error;
    }

    const rowsToDelete = tailRows.slice(plan.reusableOtherCount);
    if (rowsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from("transactions")
        .delete()
        .in("id", rowsToDelete.map((row) => row.id));
      if (deleteError) throw deleteError;
    }

    const missingStartIndex = 1 + reusableRows.length;
    const toInsert = plan.insertNumbers.map((number, insertIndex) => {
      const offset = missingStartIndex + insertIndex;
      return {
        id: uuid(),
        name: baseName,
        icon: input.icon,
        category: input.category,
        date: addMonthsKeepingFormat(input.date, offset),
        amount: perInstallment,
        type: input.type,
        card: input.card,
        bank_account_id: input.bank_account_id,
        installment_number: number,
        total_installments: total,
        installment_group_id: groupId,
        installment_mode: input.installmentMode || "divide",
        installment_source_amount: input.installmentSourceAmount ?? perInstallment,
      };
    });
    if (toInsert.length > 0) {
      const { error: insertError } = await supabase.from("transactions").insert(toInsert);
      if (insertError) throw insertError;
    }

    return { futureRowsAdded: toInsert.length, cleared: false };
  }

  if (input.updateAllInGroup && input.installment_group_id) {
'''
if update_anchor in s:
    s = s.replace(update_anchor, update_replacement, 1)
elif 'const originalCurrent = Math.max(1, Math.floor(Number(input.originalCurrent)' not in s:
    raise SystemExit('installment edit update anchor not found')

p.write_text(s)

# 3) Regression tests for the pure correction planner.
test = Path("src/tests/installment-current-correction.test.ts")
test.write_text('''import { describe, expect, it } from "vitest";\nimport { buildInstallmentCurrentCorrectionPlan } from "@/lib/installment-edit";\n\ndescribe("installment current correction plan", () => {\n  it("expands a partial 3/4 launch to 2/4", () => {\n    const plan = buildInstallmentCurrentCorrectionPlan([4], 3, 2, 4);\n    expect(plan.conflict).toBeNull();\n    expect(plan.desiredNumbers).toEqual([2, 3, 4]);\n    expect(plan.reusableOtherCount).toBe(1);\n    expect(plan.insertNumbers).toEqual([4]);\n    expect(plan.deleteOtherNumbers).toEqual([]);\n  });\n\n  it("shrinks a partial 2/4 launch to 3/4", () => {\n    const plan = buildInstallmentCurrentCorrectionPlan([3, 4], 2, 3, 4);\n    expect(plan.conflict).toBeNull();\n    expect(plan.desiredNumbers).toEqual([3, 4]);\n    expect(plan.reusableOtherCount).toBe(1);\n    expect(plan.insertNumbers).toEqual([]);\n    expect(plan.deleteOtherNumbers).toEqual([4]);\n  });\n\n  it("blocks renumbering into an installment that already exists before the edited row", () => {\n    const plan = buildInstallmentCurrentCorrectionPlan([1, 2, 4], 3, 2, 4);\n    expect(plan.conflict).toContain("Já existe a parcela 2/4");\n  });\n});\n''')

print('installment current correction patch prepared')
