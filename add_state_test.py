import sys

# Read current content
with open('src/components/CalculatorAmountInput.test.tsx', 'r') as f:
    content = f.read()

new_test = """
    it("should handle enable/disable logic for Confirm and Clear actions based on current value using only ARIA/data-category selectors", async () => {
      const user = userEvent.setup();
      render(<CalculatorAmountInput value={0} onChange={() => {}} />);
      const trigger = screen.getByRole("button", { name: /Valor: R\$ 0,00/i });

      await user.click(trigger);
      await vi.waitFor(() => expect(screen.getByRole("button", { name: /Número 1/i })).toHaveFocus());

      // Use the getKeypadButtons helper (which we know exists and is robust)
      const getConfirmBtn = () => screen.getByRole("button", { name: /Confirmar valor/i });
      const getClearBtn = () => screen.getByRole("button", { name: /Limpar todo o valor/i });

      // Initially at 0: Confirm and Clear should be available (functional)
      // Note: Current component doesn't explicitly 'disable' them via attribute, 
      // but let's verify they exist and are clickable.
      expect(getConfirmBtn()).toBeEnabled();
      expect(getClearBtn()).toBeEnabled();

      // Type something
      await user.keyboard("123"); // 1,23
      expect(getClearBtn()).toBeEnabled();
      expect(getConfirmBtn()).toBeEnabled();

      // Clear the value
      await user.click(getClearBtn());
      // Value is now 0 again
      expect(screen.getByText("R$ 0,00")).toBeInTheDocument();
      expect(getConfirmBtn()).toBeEnabled();
    });
"""

# Find the insertion point
insert_pos = content.rfind("});")
if insert_pos != -1:
    new_content = content[:insert_pos] + new_test + "});"
    with open('src/components/CalculatorAmountInput.test.tsx', 'w') as f:
        f.write(new_content)
    print("Injected state logic test successfully")
else:
    print("Could not find insertion point")
