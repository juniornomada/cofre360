import { arrayMove } from "@dnd-kit/sortable";

// Order is local to this browser; no financial records are written during drag.
export const ASSET_ORDER_STORAGE_KEY = "cofre360-investment-order";

export function parseStoredInvestmentOrder(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((id) => typeof id === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

export function sortInvestmentValuations<T extends { inv: { id: string } }>(
  entries: readonly T[],
  order: readonly string[],
): T[] {
  const positions = new Map(order.map((id, index) => [id, index]));
  return [...entries].sort((a, b) => {
    const ai = positions.get(a.inv.id);
    const bi = positions.get(b.inv.id);
    if (ai === undefined && bi === undefined) return 0;
    if (ai === undefined) return 1;
    if (bi === undefined) return -1;
    return ai - bi;
  });
}

export function moveInvestmentOrder(
  ids: readonly string[],
  activeId: string,
  overId: string,
): string[] | null {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return null;
  return arrayMove([...ids], from, to);
}
