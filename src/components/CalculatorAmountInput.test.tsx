import { render, screen, cleanup } from "@testing-library/react";
import { CalculatorAmountInput } from "./CalculatorAmountInput";
import { describe, it, expect, vi, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";

describe("CalculatorAmountInput", () => {
    afterEach(() => {
      cleanup();
    });

    it("should display formatted currency value", () => {
      render(<CalculatorAmountInput value={12.34} onChange={() => {}} />);
      const input = screen.getByRole("textbox");
      expect(input).toHaveValue("R$ 12,34");
    });

    it("should handle digit input and format as currency", async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<CalculatorAmountInput value={0} onChange={onChange} />);
      
      const input = screen.getByRole("textbox");
      
      // Clear initial value and type
      await user.clear(input);
      await user.type(input, "1");
      expect(input).toHaveValue("R$ 0,01");
      expect(onChange).toHaveBeenCalledWith(0.01);

      await user.type(input, "2");
      expect(input).toHaveValue("R$ 0,12");
      expect(onChange).toHaveBeenCalledWith(0.12);

      await user.type(input, "3");
      expect(input).toHaveValue("R$ 1,23");
      expect(onChange).toHaveBeenCalledWith(1.23);
    });

    it("should handle backspace", async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<CalculatorAmountInput value={1.23} onChange={onChange} />);
      
      const input = screen.getByRole("textbox");
      
      await user.type(input, "{Backspace}");
      expect(input).toHaveValue("R$ 0,12");
      expect(onChange).toHaveBeenCalledWith(0.12);
    });

    it("should respect max limit", async () => {
      const user = userEvent.setup();
      render(<CalculatorAmountInput value={9999999.99} onChange={() => {}} />);
      const input = screen.getByRole("textbox");
      
      await user.type(input, "1");
      expect(input).toHaveValue("R$ 9.999.999,99");
    });
});
