import sys

with open('src/components/CalculatorAmountInput.test.tsx', 'r') as f:
    content = f.read()

new_test = """
    it("should verify Tab/Shift+Tab navigation and confirm focused element using category helper, including first and last items", async () => {
      const user = userEvent.setup();
      render(<CalculatorAmountInput value={0} onChange={() => {}} />);
      const trigger = screen.getByRole("button", { name: /Valor:/i });

      await user.click(trigger);
      
      // Helper to verify focus using the existing getKeypadButtons logic
      const expectCategoryFocus = (category: string, name?: string | RegExp) => {
        const expected = getKeypadButtons(category as any, name as any);
        // If it's a list (numeric), we usually expect the first one "1" for the initial focus
        const target = Array.isArray(expected) ? expected[0] : expected;
        expect(document.activeElement).toBe(target);
      };

      // 1. Verify Initial Focus (First Item)
      await vi.waitFor(() => expectCategoryFocus('numeric', /Número 1/i));

      // 2. Tab to a few items and verify via category
      await user.tab(); // Número 2
      expectCategoryFocus('numeric', /Número 2/i);

      // 3. Navigate to a utility button
      for(let i=0; i<8; i++) await user.tab(); // 3,4,5,6,7,8,9,0
      await user.tab(); // Limpar (Destructive)
      expectCategoryFocus('destructive', /Limpar todo o valor/i);

      // 4. Navigate to the last item (Confirm)
      await user.tab(); // Backspace
      await user.tab(); // Cancel
      await user.tab(); // Confirm (Primary Action)
      expectCategoryFocus('primary-action', /Confirmar valor/i);

      // 5. Verify Wrap-around (Confirm -> Número 1)
      await user.tab();
      expectCategoryFocus('numeric', /Número 1/i);

      // 6. Verify Reverse Wrap-around (Número 1 -> Confirm)
      await user.keyboard("{Shift>}{Tab}{/Shift}");
      expectCategoryFocus('primary-action', /Confirmar valor/i);

      // 7. Verify Shift+Tab to Secondary Action (Cancel)
      await user.keyboard("{Shift>}{Tab}{/Shift}");
      expectCategoryFocus('secondary-action', /Cancelar e manter valor anterior/i);
    });
"""

insert_pos = content.rfind("});")
if insert_pos != -1:
    new_content = content[:insert_pos] + new_test + "});"
    with open('src/components/CalculatorAmountInput.test.tsx', 'w') as f:
        f.write(new_content)
    print("Injected category-based navigation test successfully")
