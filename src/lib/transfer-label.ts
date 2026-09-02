function normalizeForCompare(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function normalizeTransferDescription(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function extractTransferDescription(name: string | null | undefined) {
  const fullName = String(name || "").trim();
  if (!fullName) return "";
  const prefix = fullName.replace(/\s*[→←]\s*.+$/, "").trim();
  if (!prefix || normalizeForCompare(prefix) === "transferencia") return "";
  return prefix;
}

export function buildTransferTransactionNames(
  description: string | null | undefined,
  fromAccountName: string,
  toAccountName: string,
) {
  const label = normalizeTransferDescription(description) || "Transferência";
  return {
    outgoing: `${label} → ${toAccountName}`,
    incoming: `${label} ← ${fromAccountName}`,
  };
}
