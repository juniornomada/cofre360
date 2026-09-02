from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing patch target: {label}")
    return text.replace(old, new, 1)

# Shared helpers keep creation and editing names identical.
helper = Path("src/lib/transfer-label.ts")
helper.write_text('''function normalizeForCompare(value: string) {\n  return value\n    .normalize("NFD")\n    .replace(/[\\u0300-\\u036f]/g, "")\n    .toLowerCase()\n    .trim();\n}\n\nexport function normalizeTransferDescription(value: string | null | undefined) {\n  const trimmed = String(value || "").trim();\n  if (!trimmed) return "";\n  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);\n}\n\nexport function extractTransferDescription(name: string | null | undefined) {\n  const fullName = String(name || "").trim();\n  if (!fullName) return "";\n  const prefix = fullName.replace(/\\s*[→←]\\s*.+$/, "").trim();\n  if (!prefix || normalizeForCompare(prefix) === "transferencia") return "";\n  return prefix;\n}\n\nexport function buildTransferTransactionNames(\n  description: string | null | undefined,\n  fromAccountName: string,\n  toAccountName: string,\n) {\n  const label = normalizeTransferDescription(description) || "Transferência";\n  return {\n    outgoing: `${label} → ${toAccountName}`,\n    incoming: `${label} ← ${fromAccountName}`,\n  };\n}\n''')

# Quick Add transfer creation.
path = Path("src/components/QuickAddTransactionDialog.tsx")
text = path.read_text()
text = replace_once(
    text,
    'import { inferYieldTransactionFields } from "@/lib/account-yield";\n',
    'import { inferYieldTransactionFields } from "@/lib/account-yield";\nimport { buildTransferTransactionNames, extractTransferDescription } from "@/lib/transfer-label";\n',
    "quickadd transfer helper import",
)
text = replace_once(
    text,
    '  const [transferFromId, setTransferFromId] = useState("");\n  const [transferToId, setTransferToId] = useState("");\n',
    '  const [transferFromId, setTransferFromId] = useState("");\n  const [transferToId, setTransferToId] = useState("");\n  const [transferDescription, setTransferDescription] = useState("");\n',
    "quickadd transfer description state",
)
text = replace_once(
    text,
    '    setTransferFromId("");\n    setTransferToId("");\n\n    // Restaurar preferências',
    '    setTransferFromId("");\n    setTransferToId("");\n    setTransferDescription(\n      copyData && (copyData.category === "Transferência" || copyData.category === "Transferências" || copyData.category.startsWith("Transferências >"))\n        ? extractTransferDescription(copyData.name)\n        : "",\n    );\n\n    // Restaurar preferências',
    "quickadd reset transfer description",
)
text = replace_once(
    text,
    '        const groupId = (typeof crypto !== "undefined" && "randomUUID" in crypto)\n          ? crypto.randomUUID()\n          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;\n        \n        console.log("QuickAdd: Inserting transfer transactions", { groupId, fromName, toName });\n',
    '        const groupId = (typeof crypto !== "undefined" && "randomUUID" in crypto)\n          ? crypto.randomUUID()\n          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;\n        const transferNames = buildTransferTransactionNames(transferDescription, fromName, toName);\n        \n        console.log("QuickAdd: Inserting transfer transactions", { groupId, fromName, toName, transferDescription });\n',
    "quickadd build transfer names",
)
text = replace_once(
    text,
    '            icon: "🔄", name: `Transferência → ${toName}`, category: "Transferências > Outros",',
    '            icon: "🔄", name: transferNames.outgoing, category: "Transferências > Outros",',
    "quickadd outgoing name",
)
text = replace_once(
    text,
    '            icon: "🔄", name: `Transferência ← ${fromName}`, category: "Transferências > Outros",',
    '            icon: "🔄", name: transferNames.incoming, category: "Transferências > Outros",',
    "quickadd incoming name",
)
text = replace_once(
    text,
    '''          {isTransfer ? (\n            <>\n              <div className="rounded-xl bg-card/50 p-2.5 space-y-2">\n''',
    '''          {isTransfer ? (\n            <>\n              <div>\n                <label className="text-[11px] font-semibold text-foreground mb-0.5 block">Descrição <span className="font-normal text-muted-foreground">(opcional)</span></label>\n                <input\n                  autoFocus\n                  value={transferDescription}\n                  maxLength={80}\n                  onChange={(e) => {\n                    let description = e.target.value;\n                    if (description.length > 0) description = description.charAt(0).toUpperCase() + description.slice(1);\n                    setTransferDescription(description);\n                  }}\n                  placeholder="Ex: Aporte CDB ou Resgate CDB"\n                  className="w-full rounded-lg bg-card px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/30"\n                />\n                <p className="mt-1 text-[9px] leading-tight text-muted-foreground">Se vazio, será usado “Transferência”.</p>\n              </div>\n              <div className="rounded-xl bg-card/50 p-2.5 space-y-2">\n''',
    "quickadd transfer description field",
)
path.write_text(text)

# Transaction editor transfer description.
path = Path("src/routes/transactions.tsx")
text = path.read_text()
text = replace_once(
    text,
    'import { inferDebitInstallmentContext } from "@/lib/debit-installment-history-sync";\n',
    'import { inferDebitInstallmentContext } from "@/lib/debit-installment-history-sync";\nimport { buildTransferTransactionNames, extractTransferDescription } from "@/lib/transfer-label";\n',
    "transactions transfer helper import",
)
text = replace_once(
    text,
    '  const [transferFromId, setTransferFromId] = useState<string>("");\n   const [transferToId, setTransferToId] = useState<string>("");\n',
    '  const [transferFromId, setTransferFromId] = useState<string>("");\n   const [transferToId, setTransferToId] = useState<string>("");\n   const [transferDescription, setTransferDescription] = useState<string>("");\n',
    "transactions transfer description state",
)
text = replace_once(
    text,
    '      setEditNameMode("none");\n\n      const groupId = tx.installment_group_id || null;\n',
    '      setEditNameMode("none");\n      setTransferDescription(extractTransferDescription(tx.name));\n\n      const groupId = tx.installment_group_id || null;\n',
    "transactions load transfer description",
)
text = replace_once(
    text,
    '         const shared = {\n           icon: "🔄",\n',
    '         const transferNames = buildTransferTransactionNames(transferDescription, fromAccount.name, toAccount.name);\n         const shared = {\n           icon: "🔄",\n',
    "transactions build edited transfer names",
)
text = replace_once(
    text,
    '             name: `Transferência → ${toAccount.name}`,\n',
    '             name: transferNames.outgoing,\n',
    "transactions edited outgoing name",
)
text = replace_once(
    text,
    '             name: `Transferência ← ${fromAccount.name}`,\n',
    '             name: transferNames.incoming,\n',
    "transactions edited incoming name",
)
text = replace_once(
    text,
    '           setTransferFromId("");\n           setTransferToId("");\n           await Promise.all([fetchTransactions(), fetchBankAccounts()]);\n',
    '           setTransferFromId("");\n           setTransferToId("");\n           setTransferDescription("");\n           await Promise.all([fetchTransactions(), fetchBankAccounts()]);\n',
    "transactions reset transfer description",
)
text = replace_once(
    text,
    '''              {!isTransferTransaction(editTx) && (\n              <Suspense fallback={<div className="flex h-20 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>\n                <CategoryPicker\n                  value={editTx.category}\n                  onChange={(val, icon) => setEditTx({ ...editTx, category: val, icon })}\n                  defaultExpanded={true}\n                  type={editTx.type}\n                />\n              </Suspense>\n              )}\n\n              <div className="grid grid-cols-2 gap-2">\n''',
    '''              {!isTransferTransaction(editTx) && (\n              <Suspense fallback={<div className="flex h-20 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>\n                <CategoryPicker\n                  value={editTx.category}\n                  onChange={(val, icon) => setEditTx({ ...editTx, category: val, icon })}\n                  defaultExpanded={true}\n                  type={editTx.type}\n                />\n              </Suspense>\n              )}\n\n              {isTransferTransaction(editTx) && (\n                <div>\n                  <label className="mb-0.5 block text-[11px] font-semibold text-foreground">Descrição <span className="font-normal text-muted-foreground">(opcional)</span></label>\n                  <input\n                    autoFocus\n                    value={transferDescription}\n                    maxLength={80}\n                    onChange={(e) => {\n                      let description = e.target.value;\n                      if (description.length > 0) description = description.charAt(0).toUpperCase() + description.slice(1);\n                      setTransferDescription(description);\n                    }}\n                    placeholder="Ex: Aporte CDB ou Resgate CDB"\n                    className="w-full rounded-lg bg-card px-2.5 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary/30"\n                  />\n                  <p className="mt-1 text-[9px] leading-tight text-muted-foreground">A descrição é aplicada às duas pontas da transferência.</p>\n                </div>\n              )}\n\n              <div className="grid grid-cols-2 gap-2">\n''',
    "transactions transfer description editor",
)
path.write_text(text)
