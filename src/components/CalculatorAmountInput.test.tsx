import { getKeypadButtons } from "./__tests__/test-utils";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { CalculatorAmountInput } from "./CalculatorAmountInput";
import { describe, it, expect, vi, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";

describe("CalculatorAmountInput Accessibility", () => {
    afterEach(() => {
      cleanup();
    });

    it("should have correct ARIA roles and labels for the keypad buttons", async () => {
      const user = userEvent.setup();
      render(<CalculatorAmountInput value={0} onChange={() => {}} />);
      
      const trigger = screen.getByRole("button", { name: /Valor:/i });
      await user.click(trigger);

      // Numbers 1-9
      for (let i = 1; i <= 9; i++) {
        expect(screen.getByRole("button", { name: i.toString() })).toBeInTheDocument();
      }
      
      // Zero
      expect(screen.getByRole("button", { name: "0" })).toBeInTheDocument();
      
      // Control buttons
      expect(screen.getByRole("button", { name: /Limpar tudo/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Apagar/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Cancelar/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Confirmar/i })).toBeInTheDocument();
    });

    it("should announce value changes to screen readers", async () => {
      const user = userEvent.setup();
      render(<CalculatorAmountInput value={0} onChange={() => {}} />);
      
      const trigger = screen.getByRole("button", { name: /Valor:/i });
      const announcementRegion = screen.getByTestId("announcement-region");
      
      await user.click(trigger);
      await waitFor(() => expect(announcementRegion).toHaveTextContent(/Modo de edição de valor ativado/i), { timeout: 2000 });
      
      await user.keyboard("1");
      await waitFor(() => expect(announcementRegion).toHaveTextContent(/Valor atual: R\$ 0,01/i), { timeout: 2000 });
      
      await user.keyboard("2");
      await waitFor(() => expect(announcementRegion).toHaveTextContent(/Valor atual: R\$ 0,12/i), { timeout: 2000 });
      
      await user.keyboard("{Backspace}");
      await waitFor(() => expect(announcementRegion).toHaveTextContent(/Valor atual: R\$ 0,01/i), { timeout: 2000 });
    });

    it("should trap focus inside the keypad when open", async () => {
      const user = userEvent.setup();
      render(<CalculatorAmountInput value={0} onChange={() => {}} />);
      
      const trigger = screen.getByRole("button", { name: /Valor:/i });
      await user.click(trigger);

      // Should focus first button (1)
      await waitFor(() => expect(screen.getByRole("button", { name: "1" })).toHaveFocus());
      
      // Tab through all buttons
      const expectedNames = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "Limpar tudo", "0", "Apagar", "Cancelar", "Confirmar"];
      
      for (const name of expectedNames.slice(1)) {
        await user.tab();
        expect(screen.getByRole("button", { name: new RegExp(`^${name}$`, 'i') })).toHaveFocus();
      }
      
      // Tab from last button (Confirmar) should wrap back to first (1)
      await user.tab();
      expect(screen.getByRole("button", { name: "1" })).toHaveFocus();
      
      // Shift+Tab from first button (1) should wrap back to last (Confirmar)
      await user.keyboard("{Shift>}{Tab}{/Shift}");
      expect(screen.getByRole("button", { name: /Confirmar/i })).toHaveFocus();
    });

    it("should allow navigating and triggering buttons using keyboard alone", async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<CalculatorAmountInput value={0} onChange={onChange} />);
      
      const trigger = screen.getByRole("button", { name: /Valor:/i });
      await user.click(trigger);
      
      // Tab to number 5 and press Enter
      // Order: 1, 2, 3, 4, 5 (4 tabs)
      for (let i = 0; i < 4; i++) await user.tab();
      expect(screen.getByRole("button", { name: "5" })).toHaveFocus();
      await user.keyboard("{Enter}");
      
      const announcementRegion = screen.getByTestId("announcement-region");
      await waitFor(() => expect(announcementRegion).toHaveTextContent(/Valor atual: R\$ 0,05/i));
      
      // Tab to OK/Confirm button and press Space
      // Current: 5. Remaining: 6, 7, 8, 9, Clear, 0, Backspace, Cancel, Confirm (9 tabs)
      for (let i = 0; i < 9; i++) await user.tab();
      expect(screen.getByRole("button", { name: /Confirmar/i })).toHaveFocus();
      await user.keyboard(" ");
      
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(onChange).toHaveBeenCalledWith(0.05);
    });

    it("should return focus to the trigger button when closing keypad (on non-mobile)", async () => {
      // Mock window.innerWidth to be desktop
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
      
      const user = userEvent.setup();
      render(<CalculatorAmountInput value={0} onChange={() => {}} />);
      
      const trigger = screen.getByRole("button", { name: /Valor:/i });
      await user.click(trigger);
      
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(trigger).toHaveFocus();
    });
});
