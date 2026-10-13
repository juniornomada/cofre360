 import { render, screen, waitFor } from "@testing-library/react";
 import { TransactionItem } from "./TransactionItem";
 import { TooltipProvider } from "./ui/tooltip";
 import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
 import userEvent from "@testing-library/user-event";
 
// JSDOM não implementa ResizeObserver, usado apenas para ajuste visual de texto.
beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

afterAll(() => vi.unstubAllGlobals());

 describe("TransactionItem Accessibility", () => {
   const defaultProps = {
     icon: "💰",
     name: "Salário",
     category: "Renda > Salário",
     date: "2024-05-14",
     amount: 5000,
     type: "income" as const,
   };
 
   it("permite excluir um resgate órfão manualmente pelo botão visível no celular", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const onEdit = vi.fn();
    render(
      <TooltipProvider>
        <TransactionItem
          {...defaultProps}
          id="transfer-orphan"
          icon="🔄"
          name="Resgate CDB ← Cofrinho 140%"
          category="Transferências > Outros"
          date="10-10-2026"
          amount={564.69}
          bank_account_id="bank-account"
          installment_group_id="orphan-group"
          type="income"
          onDelete={onDelete}
          onEdit={onEdit}
        />
      </TooltipProvider>,
    );

    const deleteButton = screen.getByRole("button", {
      name: "Excluir transação: Resgate CDB ← Cofrinho 140%",
    });
    expect(deleteButton).toHaveAttribute("title", "Excluir transação");
    expect(deleteButton.className).toContain("sm:hidden");
    await user.click(deleteButton);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("não oferece exclusão manual se o fluxo não fornece onDelete", () => {
    render(
      <TooltipProvider>
        <TransactionItem {...defaultProps} onEdit={vi.fn()} />
      </TooltipProvider>,
    );
    expect(screen.queryByRole("button", { name: /Excluir transação:/ })).not.toBeInTheDocument();
  });

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
 
    expect((await screen.findAllByText("Transferência de Banco A para Banco B")).length).toBeGreaterThan(0);
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
    
    await waitFor(() => expect(trigger).toHaveAttribute("aria-describedby"));
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