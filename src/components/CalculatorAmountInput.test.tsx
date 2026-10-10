import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CalculatorAmountInput } from "./CalculatorAmountInput";
import { describe, it, expect, vi, afterEach } from "vitest";

function ControlledAmount({ initial = 0, onChange = vi.fn() }: {
  initial?: number;
  onChange?: (value: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <CalculatorAmountInput
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe("CalculatorAmountInput — edição em reais", () => {
  afterEach(() => cleanup());

  it("exibe o valor inicial formatado como moeda", () => {
    render(<CalculatorAmountInput value={12.34} onChange={() => {}} />);
    expect(screen.getByRole("textbox")).toHaveValue("R$ 12,34");
  });

  it("permite centavos e vírgula decimal sem multiplicar os reais por 100", () => {
    const onChange = vi.fn();
    render(<ControlledAmount onChange={onChange} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "0,01" } });
    expect(onChange).toHaveBeenLastCalledWith(0.01);

    fireEvent.change(input, { target: { value: "0,12" } });
    expect(onChange).toHaveBeenLastCalledWith(0.12);

    fireEvent.change(input, { target: { value: "1,23" } });
    expect(onChange).toHaveBeenLastCalledWith(1.23);
    expect(input).toHaveValue("1,23");

    fireEvent.blur(input);
    expect(input).toHaveValue("R$ 1,23");
  });

  it("permite apagar um centavo sem deslocar os demais dígitos", () => {
    const onChange = vi.fn();
    render(<ControlledAmount initial={1.23} onChange={onChange} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "1,2" } });
    expect(input).toHaveValue("1,2");
    expect(onChange).toHaveBeenLastCalledWith(1.2);

    fireEvent.blur(input);
    expect(input).toHaveValue("R$ 1,20");
  });

  it("limita a nove dígitos inteiros e dois decimais", () => {
    const onChange = vi.fn();
    render(<ControlledAmount onChange={onChange} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "1234567890123,987" } });
    expect(input).toHaveValue("123456789,98");
    expect(onChange).toHaveBeenLastCalledWith(123456789.98);
  });
});
