import { colorOptions } from "@/components/cards/card-color-options";

/**
 * Investment colors are optional. Missing colors retain the class's
 * original visual identity, so existing portfolios are not recolored.
 * Only classes from the application's palette may reach the UI or database.
 */
export function normalizeInvestmentColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return colorOptions.some((option) => option.value === value) ? value : null;
}
