/**
 * Integration tests for QuickAddTransactionDialog covering the restoration
 * of the user's last installment preferences (enabled, mode, count, amount)
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
  const digits = String(Math.round(reais * 100));
  fireEvent.change(input, { target: { value: digits } });
}
function getAmountReais(): number {
  const input = screen.getByLabelText(/^Valor:/) as HTMLInputElement;
  const digits = input.value.replace(/\D/g, "");
  return digits ? parseInt(digits, 10) / 100 : 0;
}
function clickParcelarToggle() {
  const label = screen.getByText("Parcelar");
  const toggle = label.parentElement!.querySelector("button")!;
  fireEvent.click(toggle);
}
async function selectCardNubank() {
  const nodes = await screen.findAllByText("Nubank");
  const btn = nodes.map((n) => n.closest("button")).find(Boolean) as HTMLButtonElement;
  fireEvent.click(btn);
}
function clickMode(mode: "divide" | "fixed") {
  const text = mode === "divide" ? /Valor total da compra/ : /Valor de cada parcela/;
  const btn = screen.getByText(text).closest("button") as HTMLButtonElement;
  fireEvent.click(btn);
}
function parcelarIsOn(): boolean {
  const label = screen.queryByText("Parcelar");
  if (!label) return false;
  const btn = label.parentElement!.querySelector("button") as HTMLButtonElement;
  return /bg-primary/.test(btn.className);
}
function isModeActive(mode: "divide" | "fixed"): boolean {
  const text = mode === "divide" ? /Valor total da compra/ : /Valor de cada parcela/;
  const btn = screen.getByText(text).closest("button") as HTMLButtonElement;
  return /bg-primary/.test(btn.className);
}
function isCountActive(n: number): boolean {
  const btn = screen.getByRole("button", { name: `${n}x` });
  return /bg-primary/.test(btn.className);
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

  it("restaura modo fixed, N=4 e valor por parcela ao reabrir", async () => {
    const { rerender } = render(<Harness />);
    await waitForOpen();

    // Configura: fixed, 4x, R$ 250,00
    clickParcelarToggle();
    clickMode("fixed");
    fireEvent.click(screen.getByRole("button", { name: "4x" }));
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
      expect(p).toMatchObject({ enabled: true, mode: "fixed", count: 4, amount: 250 });
    });

    // Fecha e reabre
    closeDialog();
    reopenDialog();
    await waitForOpen();

    // Estado restaurado
    expect(parcelarIsOn()).toBe(true);
    expect(isModeActive("fixed")).toBe(true);
    expect(isCountActive(4)).toBe(true);
    expect(getAmountReais()).toBe(250);
    // Summary condiz com fixed × 4
    await waitFor(() => {
      expect(screen.getByText(/4x de/)).toBeInTheDocument();
      expect(screen.getByText(/Total da compra:/)).toBeInTheDocument();
    });

    // rerender for TS unused-warning safety
    rerender(<Harness />);
  });

  it("restaura modo divide, N=6 e valor total ao reabrir", async () => {
    render(<Harness />);
    await waitForOpen();

    clickParcelarToggle(); // default mode = divide
    fireEvent.click(screen.getByRole("button", { name: "6x" }));
    setAmount(1200);

    await waitFor(() => {
      expect(screen.getByText(/6x de/)).toBeInTheDocument();
      expect(screen.getByText(/R\$ 200,00/)).toBeInTheDocument();
    });

    closeDialog();
    reopenDialog();
    await waitForOpen();

    expect(parcelarIsOn()).toBe(true);
    expect(isModeActive("divide")).toBe(true);
    expect(isCountActive(6)).toBe(true);
    expect(getAmountReais()).toBe(1200);
  });

  it("mantém 'Parcelar' desligado ao reabrir quando o usuário desativou antes de fechar", async () => {
    render(<Harness />);
    await waitForOpen();

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

    expect(parcelarIsOn()).toBe(false);
    // valor da última sessão continua restaurado (o campo é a "última despesa")
    expect(getAmountReais()).toBe(500);
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

  it("recupera de storage corrompido sem crashar (fallback aos defaults)", async () => {
    window.localStorage.setItem(PREFS_KEY, "{not-json");
    render(<Harness />);
    await waitForOpen();

    expect(parcelarIsOn()).toBe(false);
    expect(getAmountReais()).toBe(0);
  });
});
