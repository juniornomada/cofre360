 import { render, screen, fireEvent, waitFor } from "@testing-library/react";
 import { TransactionItem } from "./TransactionItem";
 import { TooltipProvider } from "./ui/tooltip";
 import { describe, it, expect, vi } from "vitest";
 import userEvent from "@testing-library/user-event";
 
 describe("TransactionItem Accessibility", () => {
   const defaultProps = {
     icon: "💰",
     name: "Salário",
     category: "Renda > Salário",
     date: "2024-05-14",
     amount: 5000,
     type: "income" as const,
   };
 
   it("should show full transfer name in tooltip when focused via keyboard", async () => {
     const user = userEvent.setup();
     render(
       <TooltipProvider>
         <TransactionItem
           {...defaultProps}
           isTransferPair={true}
           transferFromName="Banco A"
           transferToName="Banco B"
         />
       </TooltipProvider>
     );
 
     // Find the abbreviated text "Transf"
     const transfElement = screen.getByLabelText("Transferência");
     expect(transfElement).toBeInTheDocument();
 
     // Simulate keyboard focus
     await user.tab();
     expect(transfElement).toHaveFocus();
 
    // Wait for tooltip to appear - searching for the visible text specifically
    const tooltips = await screen.findAllByText("Transferência");
    expect(tooltips.length).toBeGreaterThan(0);
  });

  it("should have aria-describedby when tooltip is open", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <TransactionItem
          {...defaultProps}
          isTransferPair={true}
          transferFromName="Banco A"
          transferToName="Banco B"
        />
      </TooltipProvider>
    );

    const trigger = screen.getByLabelText("Transferência");
    await user.tab();
    
    expect(trigger).toHaveAttribute("aria-describedby");
   });
 
   it("should have correct ARIA labels for screen readers", () => {
     render(
       <TooltipProvider>
         <TransactionItem
           {...defaultProps}
           installment_number={1}
           total_installments={12}
         />
       </TooltipProvider>
     );
 
     const installmentBadge = screen.getByLabelText("Parcela 1 de 12");
     expect(installmentBadge).toBeInTheDocument();
     expect(installmentBadge).toHaveAttribute("tabindex", "0");
   });
 
   it("should show transfer details tooltip on hover", async () => {
     const user = userEvent.setup();
     render(
       <TooltipProvider>
         <TransactionItem
           {...defaultProps}
           isTransferPair={true}
           transferFromName="Nubank"
           transferToName="Itaú"
         />
       </TooltipProvider>
     );
 
     const transferName = screen.getByText("Nubank → Itaú");
     await user.hover(transferName);
 
    const fullDescriptions = await screen.findAllByText("Transferência de Nubank para Itaú");
    expect(fullDescriptions.length).toBeGreaterThan(0);
   });
 });