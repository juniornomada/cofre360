import sys

with open('src/components/CalculatorAmountInput.test.tsx', 'r') as f:
    content = f.read()

# Helper function to find and remove older redundant tests if they are too similar
# But the user asked for a new parameterized test. 
# I will add a new test case that demonstrates this parameterized approach.

parameterized_test = """
    describe("Parameterized category interactions", () => {
      const categories = [
        { name: 'numeric', selector: /Número 5/i, action: 'type' },
        { name: 'destructive', selector: /Limpar todo o valor/i, action: 'clear' },
        { name: 'utility', selector: /Apagar último dígito/i, action: 'backspace' },
        { name: 'secondary-action', selector: /Cancelar e manter valor anterior/i, action: 'cancel' },
        { name: 'primary-action', selector: /Confirmar valor/i, action: 'confirm' }
      ];

      categories.forEach(({ name, selector, action }) => {
        it(`should correctly interact with ${name} category using ${action} action`, async () => {
          const onChange = vi.fn();
          const user = userEvent.setup();
          render(<CalculatorAmountInput value={0.5} onChange={onChange} />);
          
          const trigger = screen.getByRole("button", { name: /Valor:/i });
          await user.click(trigger);

          const btn = getKeypadButtons(name as any, selector);
          expect(btn).toBeInTheDocument();
          
          if (action === 'type') {
            await user.click(btn);
            expect(screen.getByTestId("announcement-region")).toHaveTextContent(/0,05/i);
          } else if (action === 'clear') {
            await user.click(btn);
            expect(screen.getByTestId("announcement-region")).toHaveTextContent(/0,00/i);
          } else if (action === 'backspace') {
            // Type first
            await user.keyboard("12"); // 0.12
            await user.click(btn);
            expect(screen.getByTestId("announcement-region")).toHaveTextContent(/0,01/i);
          } else if (action === 'cancel') {
            await user.click(btn);
            await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
            expect(onChange).not.toHaveBeenCalledWith(0); // Should keep original 0.5 indirectly or just close
          } else if (action === 'confirm') {
            await user.keyboard("77"); // 0.77
            await user.click(btn);
            await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
            expect(onChange).toHaveBeenCalledWith(0.77);
          }
        });
      });
    });
"""

insert_pos = content.rfind("});")
if insert_pos != -1:
    new_content = content[:insert_pos] + parameterized_test + "});"
    with open('src/components/CalculatorAmountInput.test.tsx', 'w') as f:
        f.write(new_content)
    print("Injected parameterized category tests successfully")
