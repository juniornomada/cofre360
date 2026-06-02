import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CalculatorAmountInput } from '../components/CalculatorAmountInput';

describe('CalculatorAmountInput', () => {
  it('updates value and clears on focus', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <CalculatorAmountInput value={50} onChange={onChange} />
    );
    
    const input = getByLabelText(/valor:/i) as HTMLInputElement;
    
    // Verificando valor inicial formatado (R$ 50,00)
    expect(input.value.replace(/\u00a0/g, ' ')).toContain('R$ 50,00');

    // Teste de foco (deve limpar o campo)
    fireEvent.focus(input);
    expect(onChange).toHaveBeenCalledWith(0);
    expect(input.value.replace(/\u00a0/g, ' ')).toContain('R$ 0,00');

    // Teste de alteração de valor (7500 centavos = R$ 75,00)
    fireEvent.change(input, { target: { value: '7500' } });
    expect(onChange).toHaveBeenCalledWith(75);
    expect(input.value.replace(/\u00a0/g, ' ')).toContain('R$ 75,00');
  });

  it('immediately updates for R$ 10.000,00', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <CalculatorAmountInput value={0} onChange={onChange} />
    );
    
    const input = getByLabelText(/valor:/i) as HTMLInputElement;
    
    fireEvent.change(input, { target: { value: '1000000' } }); // 1000000 centavos = R$ 10.000,00
    expect(onChange).toHaveBeenCalledWith(10000);
    expect(input.value.replace(/\u00a0/g, ' ')).toContain('10.000,00');
  });
});
