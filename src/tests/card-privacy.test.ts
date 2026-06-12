import { describe, it, expect } from 'vitest';

/**
 * Simulação da lógica de exibição de valores com base na preferência de privacidade.
 * No componente real (src/routes/cards.tsx), a lógica é:
 * {balanceVisible ? `R$ ${valor.toLocaleString(...)}` : "••••••"}
 */
function formatValue(value: number, balanceVisible: boolean): string {
  if (!balanceVisible) {
    return "••••••";
  }
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

describe('Privacidade de Valores nos Cartões', () => {
  const invoiceAmount = 251.62;
  const availableLimit = 4748.38;

  it('deve ocultar os valores quando a visibilidade do saldo estiver desativada', () => {
    const isVisible = false;
    
    const formattedInvoice = formatValue(invoiceAmount, isVisible);
    const formattedLimit = formatValue(availableLimit, isVisible);

    expect(formattedInvoice).toBe("••••••");
    expect(formattedLimit).toBe("••••••");
  });

  it('deve exibir os valores corretamente quando a visibilidade do saldo estiver ativa', () => {
    const isVisible = true;
    
    const formattedInvoice = formatValue(invoiceAmount, isVisible);
    const formattedLimit = formatValue(availableLimit, isVisible);

    // Verifica se contém o símbolo de moeda e o valor formatado (substituindo o espaço não separável)
    expect(formattedInvoice).toContain("R$");
    expect(formattedInvoice).toContain("251,62");
    
    expect(formattedLimit).toContain("R$");
    expect(formattedLimit).toContain("4.748,38");
  });

  it('deve refletir a mudança de visibilidade imediatamente', () => {
    let isVisible = false;
    
    // Inicialmente oculto
    expect(formatValue(invoiceAmount, isVisible)).toBe("••••••");
    
    // Usuário clica no ícone de olho para mostrar
    isVisible = true;
    expect(formatValue(invoiceAmount, isVisible)).toContain("251,62");
    
    // Usuário clica novamente para ocultar
    isVisible = false;
    expect(formatValue(invoiceAmount, isVisible)).toBe("••••••");
  });
});
