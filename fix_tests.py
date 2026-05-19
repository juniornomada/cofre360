import sys

# Read current content
with open('src/components/CalculatorAmountInput.test.tsx', 'r') as f:
    content = f.read()

# New test content for exhaustive Tab navigation
new_test = """
    it("should ensure every button in the keypad is reached exactly once per Tab cycle in each theme", async () => {
      const user = userEvent.setup();
      render(<CalculatorAmountInput value={0} onChange={() => {}} />);
      const trigger = screen.getByRole("button", { name: /Valor: R\$ 0,00/i });

      const validateCycle = async (theme: 'light' | 'dark') => {
        if (theme === 'dark') document.documentElement.classList.add("dark");
        else document.documentElement.classList.remove("dark");

        await user.click(trigger);
        await vi.waitFor(() => expect(screen.getByRole("button", { name: /Número 1/i })).toHaveFocus());

        // There are 14 buttons total: 10 digits (0-9), C, Backspace, Cancel, OK
        const totalButtons = 14;
        const visitedLabels = new Set<string>();
        
        // Record first button
        visitedLabels.add(document.activeElement?.getAttribute('aria-label') || "");

        // Perform (totalButtons - 1) tabs to visit all others
        for (let i = 0; i < totalButtons - 1; i++) {
          await user.tab();
          const currentLabel = document.activeElement?.getAttribute('aria-label') || "";
          expect(visitedLabels.has(currentLabel), `Button ${currentLabel} visited more than once`).toBe(false);
          visitedLabels.add(currentLabel);
        }

        expect(visitedLabels.size).toBe(totalButtons);
        
        // One more tab should wrap around to the first one
        await user.tab();
        expect(document.activeElement?.getAttribute('aria-label')).toBe("Número 1");

        // Close to reset for next theme test
        await user.keyboard("{Escape}");
        await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      };

      await validateCycle('light');
      await validateCycle('dark');

      // Cleanup
      document.documentElement.classList.remove("dark");
    });
"""

# Inject before the final closing "});"
insert_pos = content.rfind("});")
if insert_pos != -1:
    parts = content.split('});')
    new_content = '});'.join(parts[:-1]) + new_test + '});'
    with open('src/components/CalculatorAmountInput.test.tsx', 'w') as f:
        f.write(new_content)
    print("Injected exhaustive navigation cycle test successfully")
else:
    print("Could not find insertion point")
