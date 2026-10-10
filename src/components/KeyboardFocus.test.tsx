import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CalculatorAmountInput } from "./CalculatorAmountInput";
import { describe, it, expect, afterEach } from "vitest";

describe("CalculatorAmountInput — teclado e foco", () => {
  afterEach(() => cleanup());

  it("usa o teclado decimal nativo sem focar automaticamente", () => {
    render(<CalculatorAmountInput value={12.34} onChange={() => {}} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;

    expect(input.inputMode).toBe("decimal");
    expect(document.activeElement).not.toBe(input);

    fireEvent.focus(input);
    expect(input.inputMode).toBe("decimal");
    fireEvent.blur(input);
    expect(input.inputMode).toBe("decimal");
  });

  it("aceita foco programático sem trocar o tipo de entrada", () => {
    render(<CalculatorAmountInput value={12.34} onChange={() => {}} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;

    input.focus();
    expect(input).toHaveFocus();
    expect(input.inputMode).toBe("decimal");
    expect(input.type).toBe("text");
  });
});
