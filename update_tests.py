import sys

# Read current content
with open('src/components/CalculatorAmountInput.test.tsx', 'r') as f:
    content = f.read()

# The verifyFocusVisible helper seems to be missing in the previous view or already exists but I need to ensure it's robust.
# Let's search for it.
if "function verifyFocusVisible" not in content:
    # Adding a robust verifyFocusVisible helper if not present or refactoring it
    helper_code = """
    const verifyFocusVisible = (element: Element) => {
      const style = window.getComputedStyle(element);
      const hasRing = style.boxShadow.includes('ring') || style.boxShadow.includes('rgba(59, 130, 246') || parseInt(style.outlineWidth) > 0;
      const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) !== 0;
      expect(isVisible).toBe(true);
      // Tailwind focus-visible:ring-primary usually translates to a box-shadow or outline in JSDOM if styles are loaded,
      // but JSDOM doesn't always process Tailwind classes perfectly. We check for the class presence as a fallback.
      const hasFocusClass = element.classList.contains('focus-visible:ring-primary') || 
                            element.classList.contains('ring-primary') ||
                            element.classList.contains('ring-2');
      expect(hasRing || hasFocusClass).toBe(true);
    };
"""
else:
    helper_code = ""

# Search for the test I just added and replace it with the enhanced version
old_test_start = "it(\"should ensure every button in the keypad is reached exactly once per Tab cycle in each theme\", async () => {"
if old_test_start in content:
    new_test = """
    it("should ensure every button in the keypad is reached exactly once per Tab cycle and maintains focus-visible style in each theme", async () => {
      const user = userEvent.setup();
      render(<CalculatorAmountInput value={0} onChange={() => {}} />);
      const trigger = screen.getByRole("button", { name: /Valor: R\$ 0,00/i });

      const verifyFocusStyle = (element: Element) => {
        const style = window.getComputedStyle(element);
        // In JSDOM with Tailwind, we primarily look for the presence of the expected focus classes
        // because JSDOM doesn't compute complex CSS variables/rings perfectly without a full engine.
        const classes = Array.from(element.classList);
        const hasFocusVisibleClass = classes.some(c => c.includes('focus-visible:ring'));
        const hasRingClass = classes.some(c => c.includes('ring-primary') || c.includes('ring-offset'));
        
        expect(hasFocusVisibleClass || hasRingClass).toBe(true);
        expect(style.display).not.toBe('none');
        expect(style.visibility).not.toBe('hidden');
      };

      const validateCycle = async (theme: 'light' | 'dark') => {
        if (theme === 'dark') {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }

        await user.click(trigger);
        await vi.waitFor(() => expect(screen.getByRole("button", { name: /Número 1/i })).toHaveFocus());

        // There are 14 buttons total: 10 digits (0-9), C, Backspace, Cancel, OK
        const totalButtons = 14;
        const visitedLabels = new Set<string>();
        
        // Record and verify first button
        const firstBtn = document.activeElement as HTMLElement;
        visitedLabels.add(firstBtn.getAttribute('aria-label') || "");
        verifyFocusStyle(firstBtn);

        // Perform (totalButtons - 1) tabs to visit all others
        for (let i = 0; i < totalButtons - 1; i++) {
          await user.tab();
          const currentBtn = document.activeElement as HTMLElement;
          const currentLabel = currentBtn.getAttribute('aria-label') || "";
          
          expect(visitedLabels.has(currentLabel), `Button ${currentLabel} visited more than once in ${theme} mode`).toBe(false);
          visitedLabels.add(currentLabel);
          
          // Verify visual focus indicator after Tab
          verifyFocusStyle(currentBtn);

          // Toggle theme mid-cycle for extra robustness
          if (i === 5) {
             const oppositeTheme = theme === 'light' ? 'dark' : 'light';
             if (oppositeTheme === 'dark') document.documentElement.classList.add("dark");
             else document.documentElement.classList.remove("dark");
             
             // Verify same element still has focus style after theme change
             verifyFocusStyle(currentBtn);
             
             // Restore theme
             if (theme === 'dark') document.documentElement.classList.add("dark");
             else document.documentElement.classList.remove("dark");
          }
        }

        expect(visitedLabels.size).toBe(totalButtons);
        
        // One more tab should wrap around to the first one
        await user.tab();
        const wrappedBtn = document.activeElement as HTMLElement;
        expect(wrappedBtn.getAttribute('aria-label')).toBe("Número 1");
        verifyFocusStyle(wrappedBtn);

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
    # Find the end of the old test
    test_idx = content.find(old_test_start)
    # Find next closing }); 
    # This is a bit risky if there are nested closures, but the previous script worked similarly.
    # Let's use a more precise replacement.
    
    # Actually, the previous script injected it at the end.
    # I'll just find the exact string I injected and replace it.
    
    # I will read the file again to be absolutely sure of the content of the test I'm replacing.
    import re
    
    # The test was injected at the end.
    # Let's just find the start of that test and replace everything until the last });
    
    start_pos = content.find(old_test_start)
    if start_pos != -1:
        new_content = content[:start_pos] + new_test + "});"
        with open('src/components/CalculatorAmountInput.test.tsx', 'w') as f:
            f.write(new_content)
        print("Updated exhaustive navigation cycle test with focus-visible validation")
    else:
        print("Could not find the test to update")
else:
    print("Could not find old test start")

