/**
 * Integration tests for QuickAddTransactionDialog covering the restoration
 * of the user's last installment preferences (enabled, mode, count)
 * when the dialog is closed and reopened.
 *
 * Preferences are persisted under `quickadd:card-installment-prefs:v1` in
 * localStorage. They apply only to expense flows and only when we are NOT
 * duplicating an existing transaction via `copyData`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

// --- Mocks ---------------------------------------------------------------
vi.mock("@/integrations/supabase/client", () => {
  const cards = [{ name: "Nubank", brand: "mastercard", emoji: null, color: null }];
  return {
    supabase: {
      from: (table: string) => {
        if (table === "cards") {
          return { select: () => ({ order: () => Promise.resolve({ data: cards, error: null }) }) };
        }
        if (table === "bank_accounts") {
          return { select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) };
        }
        return {
          select: () => ({
            order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
            not: () => Promise.resolve({ data: [], error: null }),
          }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      },
    },
  };
});

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { QuickAddTransactionDialog } from "@/components/QuickAddTransactionDialog";

const PREFS_KEY = "quickadd:card-installment-prefs:v1";

// --- Helpers -------------------------------------------------------------
function Harness({ initialType = "expense", copyData = null as any }: { initialType?: "expense" | "income" | "transfer"; copyData?: any }) {
  const [open, setOpen] = React.useState(true);
  return (
    <>
      <button data-testid="open" onClick={() => setOpen(true)}>open</button>
      <button data-testid="close" onClick={() => setOpen(false)}>close</button>
      <QuickAddTransactionDialog
        open={open}
        onOpenChange={setOpen}
        initialType={initialType}
        copyData={copyData}
      />
    </>
  );
}

function setAmount(reais: number) {
  const input = screen.getByLabelText(/^Valor:/) as HTMLInputElement;
  // O campo usa reais e separador decimal, não digitação por centavos.
  fireEvent.change(input, { target: { value: reais.toFixed(2).replace(".", ",") } });
}
function getAmountReais(): number {
  const input = screen.getByLabelText(/^Valor:/) as HTMLInputElement;
  const digits = input.value.replace(/\D/g, "");
  return digits ? parseInt(digits, 10) / 100 : 0;
}
function clickParcelarToggle() {
  fireEvent.click(screen.getByRole("button", { name: "Alternar parcelamento" }));
}

function setInstallmentCount(count: number) {
  fireEvent.change(screen.getByRole("spinbutton", { name: "Total de parcelas" }), {
    target: { value: String(count) },
  });
}
async function selectCardNubank() {
  const nodes = await screen.findAllByText("Nubank");
  const btn = nodes.map((n) => n.closest("button")).find(Boolean) as HTMLButtonElement;
  fireEvent.click(btn);
}
function clickMode(mode: "divide" | "fixed") {
  const name = mode === "divide" ? /Valor total da compra/ : /Valor de cada parcela/;
  fireEvent.click(screen.getByRole("button", { name }));
}
function parcelarIsOn(): boolean {
  const toggle = screen.queryByRole("button", { name: "Alternar parcelamento" });
  return toggle?.getAttribute("aria-pressed") === "true";
}
function isModeActive(mode: "divide" | "fixed"): boolean {
  const name = mode === "divide" ? /Valor total da compra/ : /Valor de cada parcela/;
  const btn = screen.getByRole("button", { name });
  return /bg-primary/.test(btn.className);
}
function isCountActive(n: number): boolean {
  const count = screen.getByRole("spinbutton", { name: "Total de parcelas" }) as HTMLInputElement;
  return count.value === String(n);
}
async function waitForOpen() {
  await screen.findAllByText("Nubank");
}
function closeDialog() {
  act(() => {
    fireEvent.click(screen.getByTestId("close"));
  });
}
function reopenDialog() {
  act(() => {
    fireEvent.click(screen.getByTestId("open"));
  });
}

// --- Tests ---------------------------------------------------------------
describe("QuickAddTransactionDialog — restoração de preferências ao reabrir", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("restaura modo fixed e N=4 sem guardar o valor financeiro no navegador", async () => {
    render(<Harness />);
    await waitForOpen();

    // Configura: seleciona cartão, fixed, 4x, R$ 250,00
    await selectCardNubank();
    clickParcelarToggle();
    clickMode("fixed");
    setInstallmentCount(4);
    setAmount(250);

    await waitFor(() => {
      expect(screen.getByText(/4x de/)).toBeInTheDocument();
      expect(screen.getByText(/R\$ 1\.000,00/)).toBeInTheDocument();
    });

    // Confere que a preferência foi persistida
    await waitFor(() => {
      const raw = window.localStorage.getItem(PREFS_KEY);
      expect(raw).toBeTruthy();
      const p = JSON.parse(raw!);
      expect(p).toEqual({ enabled: true, mode: "fixed", count: 4 });
      expect(raw).not.toContain("250");
    });

    // Fecha e reabre
    closeDialog();
    reopenDialog();
    await waitForOpen();

    // Valor NÃO é reaproveitado em outra transação para evitar duplicidade.
    expect(getAmountReais()).toBe(0);

    // Ao reselecionar o cartão, a UI de parcelamento reflete o estado restaurado
    await selectCardNubank();
    expect(parcelarIsOn()).toBe(true);
    expect(isModeActive("fixed")).toBe(true);
    expect(isCountActive(4)).toBe(true);
    await waitFor(() => {
      expect(screen.getByText(/4x de/)).toBeInTheDocument();
      expect(screen.getByText(/Total da compra:/)).toBeInTheDocument();
    });
  });

  it("restaura modo divide e N=6 sem restaurar o valor total", async () => {
    render(<Harness />);
    await waitForOpen();

    await selectCardNubank();
    clickParcelarToggle(); // default mode = divide
    setInstallmentCount(6);
    setAmount(1200);

    await waitFor(() => {
      expect(screen.getByText(/6x de/)).toBeInTheDocument();
      expect(screen.getByText(/R\$ 200,00/)).toBeInTheDocument();
    });

    closeDialog();
    reopenDialog();
    await waitForOpen();

    expect(getAmountReais()).toBe(0);

    await selectCardNubank();
    expect(parcelarIsOn()).toBe(true);
    expect(isModeActive("divide")).toBe(true);
    expect(isCountActive(6)).toBe(true);
  });

  it("mantém 'Parcelar' desligado ao reabrir quando o usuário desativou antes de fechar", async () => {
    render(<Harness />);
    await waitForOpen();

    await selectCardNubank();
    clickParcelarToggle(); // ON
    setAmount(500);
    clickParcelarToggle(); // OFF de novo

    await waitFor(() => {
      const raw = window.localStorage.getItem(PREFS_KEY);
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw!).enabled).toBe(false);
    });

    closeDialog();
    reopenDialog();
    await waitForOpen();

    // Apenas a preferência desativada persiste; valor financeiro volta a zero.
    expect(getAmountReais()).toBe(0);
    await selectCardNubank();
    expect(parcelarIsOn()).toBe(false);
  });

  it("IGNORA preferências quando o diálogo abre com copyData (duplicação)", async () => {
    // Semeia prefs "fortes" no storage
    window.localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ enabled: true, mode: "fixed", count: 5, amount: 999 }),
    );

    render(
      <Harness
        copyData={{
          name: "Cópia",
          amount: 42,
          category: "Alimentação > Outros",
          icon: "🍔",
          card: null,
          bank_account_id: null,
        }}
      />,
    );
    await waitForOpen();

    // copyData ganha: parcelar OFF, valor = 42 (da duplicação), não 999
    expect(parcelarIsOn()).toBe(false);
    expect(getAmountReais()).toBe(42);
  });

  it("IGNORA preferências quando initialType='income'", async () => {
    window.localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ enabled: true, mode: "fixed", count: 3, amount: 555 }),
    );

    render(<Harness initialType="income" />);
    // Aguarda diálogo carregar (não há cartão no fluxo income, mas mock resolve)
    await waitFor(() => {
      expect(screen.getByLabelText(/^Valor:/)).toBeInTheDocument();
    });

    // Não deve restaurar valor de despesa nem habilitar parcelamento
    expect(getAmountReais()).toBe(0);
    // A UI de parcelamento nem sequer aparece em receita — sanity check:
    expect(screen.queryByText("Parcelar")).toBeNull();
  });

  it("migra preferências antigas removendo o valor monetário persistido", async () => {
    window.localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ enabled: true, mode: "fixed", count: 5, amount: 999 }),
    );

    render(<Harness />);
    await waitForOpen();

    await waitFor(() => {
      const raw = window.localStorage.getItem(PREFS_KEY);
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw!)).toEqual({ enabled: true, mode: "fixed", count: 5 });
    });

    expect(getAmountReais()).toBe(0);
    await selectCardNubank();
    expect(parcelarIsOn()).toBe(true);
    expect(isModeActive("fixed")).toBe(true);
    expect(isCountActive(5)).toBe(true);
  });

  it("recupera de storage corrompido sem crashar (fallback aos defaults)", async () => {
    window.localStorage.setItem(PREFS_KEY, "{not-json");
    render(<Harness />);
    await waitForOpen();

    expect(parcelarIsOn()).toBe(false);
    expect(getAmountReais()).toBe(0);
  });
});
