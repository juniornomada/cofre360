import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NonBlockingErrorBoundary } from "@/components/NonBlockingErrorBoundary";

function BrokenChart(): never {
  throw new Error("Chart import or render failed");
}

describe("Tela de transações não depende dos gráficos", () => {
  it("mantém os lançamentos acessíveis quando o gráfico falha", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <div>
          <p>Lançamentos carregados</p>
          <NonBlockingErrorBoundary fallback={<p>Gráficos indisponíveis</p>}>
            <BrokenChart />
          </NonBlockingErrorBoundary>
        </div>,
      );
      expect(screen.getByText("Lançamentos carregados")).toBeTruthy();
      expect(screen.getByText("Gráficos indisponíveis")).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });
});
