import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CalculatorAmountInput } from "../CalculatorAmountInput";
import userEvent from "@testing-library/user-event";

describe("Mobile Keyboard Usability", () => {
  beforeEach(() => {
    // Reset mocks and state
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  const setupMobile = () => {
    // Mock mobile environment
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
    Object.defineProperty(window, 'ontouchstart', { writable: true, configurable: true, value: {} });
    window.dispatchEvent(new Event('resize'));
  };

  const setupDesktop = () => {
    // Mock desktop environment
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
    Object.defineProperty(window, 'ontouchstart', { writable: true, configurable: true, value: undefined });
    window.dispatchEvent(new Event('resize'));
  };

  it("should NOT contain any focusable input that triggers OS keyboard on mobile", async () => {
    setupMobile();
    render(<CalculatorAmountInput value={0} onChange={() => {}} />);
    
    // Check for any input elements
    const inputs = document.querySelectorAll('input');
    // Only inputs with readOnly or hidden should be acceptable if they exist, 
    // but our current implementation has 0 inputs.
    expect(inputs.length).toBe(0);

    // Opening the keypad should still not show any input
    const trigger = screen.getByRole("button", { name: /Valor:/i });
    fireEvent.click(trigger);

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(document.querySelectorAll('input').length).toBe(0);
  });

  it("should explicitly blur active element when closing keypad on mobile to ensure OS keyboard dismissal", async () => {
    setupMobile();
    const user = userEvent.setup();
    render(<CalculatorAmountInput value={10} onChange={() => {}} />);
    
    const trigger = screen.getByRole("button", { name: /Valor:/i });
    await user.click(trigger);

    const keypad = screen.getByRole("dialog");
    expect(keypad).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: /Confirmar valor/i });
    await user.click(confirmBtn);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    
    // On mobile, we expect nothing to be focused (or at least not the trigger button automatically)
    // because we call .blur()
    expect(document.activeElement).not.toBe(trigger);
    expect(document.activeElement === document.body || document.activeElement === null).toBe(true);
  });

  it("should return focus to trigger button on desktop when closing keypad", async () => {
    setupDesktop();
    const user = userEvent.setup();
    render(<CalculatorAmountInput value={10} onChange={() => {}} />);
    
    const trigger = screen.getByRole("button", { name: /Valor:/i });
    await user.click(trigger);

    const confirmBtn = screen.getByRole("button", { name: /Confirmar valor/i });
    await user.click(confirmBtn);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    
    // On desktop, we DO expect focus to return to trigger for accessibility
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
