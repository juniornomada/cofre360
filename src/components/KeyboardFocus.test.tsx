import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CalculatorAmountInput } from "./CalculatorAmountInput";
import { describe, it, expect, vi, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";

describe("CalculatorAmountInput Keyboard Focus", () => {
    afterEach(() => {
      cleanup();
    });

    it("should start with inputMode 'none' and change to 'numeric' only on click/touch", async () => {
      render(<CalculatorAmountInput value={12.34} onChange={() => {}} />);
      const input = screen.getByRole("textbox") as HTMLInputElement;
      
      // Initially should be "none" to prevent keyboard
      expect(input.inputMode).toBe("none");

      // Clicking should enable numeric keyboard
      fireEvent.click(input);
      expect(input.inputMode).toBe("numeric");

      // Blurring should reset to "none"
      fireEvent.blur(input);
      expect(input.inputMode).toBe("none");

      // Touch should also enable numeric keyboard
      fireEvent.touchStart(input);
      expect(input.inputMode).toBe("numeric");
    });

    it("should not open keyboard if just focused programmatically (without click)", () => {
        render(<CalculatorAmountInput value={12.34} onChange={() => {}} />);
        const input = screen.getByRole("textbox") as HTMLInputElement;
        
        input.focus();
        expect(input.inputMode).toBe("none");
    });
});
