import type { AssetClass } from "@/lib/investments-calc";

/** Existing visual identity of the asset-class allocation chart. */
export const ASSET_CLASS_COLORS: Record<AssetClass, string> = {
  pos_fixado: "#FACC15",
  alternativos: "#A855F7",
  renda_variavel_global: "#EF4444",
  renda_variavel_brasil: "#06B6D4",
  tesouro: "#EAB308",
  cdb: "#22C55E",
  cripto: "#F97316",
  acao: "#3B82F6",
  fii: "#14B8A6",
  etf: "#6366F1",
  outro: "#94A3B8",
};

/** Preset swatches match the colors already used in Cofre 360. */
export const INVESTMENT_COLOR_OPTIONS = [
  { label: "Verde", value: "#22C55E" },
  { label: "Azul", value: "#3B82F6" },
  { label: "Turquesa", value: "#14B8A6" },
  { label: "Ciano", value: "#06B6D4" },
  { label: "Roxo", value: "#A855F7" },
  { label: "Índigo", value: "#6366F1" },
  { label: "Amarelo", value: "#FACC15" },
  { label: "Dourado", value: "#EAB308" },
  { label: "Laranja", value: "#F97316" },
  { label: "Vermelho", value: "#EF4444" },
  { label: "Cinza", value: "#94A3B8" },
] as const;

export function normalizeInvestmentColor(color: string | null | undefined): string | null {
  return typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)
    ? color.toUpperCase()
    : null;
}

export function getAssetClassColor(assetClass: string | null | undefined): string {
  return ASSET_CLASS_COLORS[(assetClass || "outro") as AssetClass] || ASSET_CLASS_COLORS.outro;
}

/** A custom fund color never changes the allocation chart's class identity. */
export function getInvestmentColor(
  color: string | null | undefined,
  assetClass: string | null | undefined,
): string {
  return normalizeInvestmentColor(color) || getAssetClassColor(assetClass);
}
