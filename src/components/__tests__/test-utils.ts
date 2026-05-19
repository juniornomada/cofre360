import { screen as rtlScreen } from "@testing-library/react";
import { expect as vitestExpect } from "vitest";

/**
 * Helper to select keypad buttons by their functional category.
 * Ensures tests don't depend on visual text and follow ARIA/data-category standards.
 */
export function getKeypadButtons(category: 'numeric'): HTMLElement[];
export function getKeypadButtons(category: 'primary-action' | 'secondary-action' | 'destructive' | 'utility', name: string | RegExp): HTMLElement;
export function getKeypadButtons(category: string, name?: string | RegExp): HTMLElement | HTMLElement[] {
  if (category === 'numeric' && !name) {
    return rtlScreen.getAllByRole("button").filter(btn => btn.getAttribute("data-category") === "numeric") as HTMLElement[];
  }
  
  const options: { name?: string | RegExp } = {};
  if (name) options.name = name;
  
  const btn = rtlScreen.getByRole("button", options) as HTMLElement;
  vitestExpect(btn).toHaveAttribute("data-category", category);
  return btn;
}
