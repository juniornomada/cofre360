import sys

# Read current content
with open('src/components/CalculatorAmountInput.test.tsx', 'r') as f:
    content = f.read()

new_test = """
    it("should ensure every button is reached exactly once per Shift+Tab cycle and maintains focus and aria-live consistency during theme changes", async () => {
      const user = userEvent.setup();
      render(<CalculatorAmountInput value={0} onChange={() => {}} />);
      const trigger = screen.getByRole("button", { name: /Valor: R\$ 0,00/i });
      const liveRegion = screen.getByTestId("announcement-region");

      const validateReverseCycle = async (initialTheme: 'light' | 'dark') => {
        if (initialTheme === 'dark') document.documentElement.classList.add("dark");
        else document.documentElement.classList.remove("dark");

        await user.click(trigger);
        // Wait for initial focus on "Número 1"
        await vi.waitFor(() => expect(screen.getByRole("button", { name: /Número 1/i })).toHaveFocus());

        // 14 buttons total. Shift+Tab from "1" should go to "OK"
        const totalButtons = 14;
        const visitedLabels = new Set<string>();
        
        // Record starting button ("Número 1")
        visitedLabels.add(document.activeElement?.getAttribute('aria-label') || "");

        for (let i = 0; i < totalButtons - 1; i++) {
          await user.keyboard("{Shift>}{Tab}{/Shift}");
          const currentBtn = document.activeElement as HTMLElement;
          const currentLabel = currentBtn.getAttribute('aria-label') || "";
          
          expect(visitedLabels.has(currentLabel), `Button ${currentLabel} visited more than once in reverse cycle`).toBe(false);
          visitedLabels.add(currentLabel);

          // After half the cycle, toggle theme and verify live region remains valid
          if (i === 7) {
             const oppositeTheme = initialTheme === 'light' ? 'dark' : 'light';
             if (oppositeTheme === 'dark') document.documentElement.classList.add("dark");
             else document.documentElement.classList.remove("dark");
             
             // Interact with a numeric button if focused to check aria-live
             if (currentBtn.getAttribute("data-category") === "numeric") {
                await user.keyboard("{Enter}");
                // Value should update and be announced
                await vi.waitFor(() => expect(liveRegion).not.toHaveTextContent("R$ 0,00"));
             }
             
             expect(document.activeElement).toBe(currentBtn);
          }
        }

        expect(visitedLabels.size).toBe(totalButtons);
        
        // One more Shift+Tab should wrap back to "Número 1"
        await user.keyboard("{Shift>}{Tab}{/Shift}");
        expect(document.activeElement?.getAttribute('aria-label')).toBe("Número 1");

        // Close
        await user.keyboard("{Escape}");
        await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      };

      await validateReverseCycle('light');
      await validateReverseCycle('dark');

      document.documentElement.classList.remove("dark");
    });
"""

# Find the insertion point (before the last closing "});")
insert_pos = content.rfind("});")
if insert_pos != -1:
    new_content = content[:insert_pos] + new_test + "});"
    with open('src/components/CalculatorAmountInput.test.tsx', 'w') as f:
        f.write(new_content)
    print("Injected exhaustive Shift+Tab navigation cycle test successfully")
else:
    print("Could not find insertion point")
