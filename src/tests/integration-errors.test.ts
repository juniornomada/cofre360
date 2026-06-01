import { describe, it, expect } from 'vitest';
import { ERROR_MESSAGES } from '@/lib/constants';
import { getFriendlyErrorMessage } from '@/lib/utils';

/**
 * Teste de integração para garantir que todas as mensagens exibidas na UI
 * em cenários de erro provenham do ERROR_MESSAGES.
 */
describe('Error Message Integration Consistency', () => {
  // Coletamos todas as mensagens definidas como fonte de verdade
  const validMessages = Object.values(ERROR_MESSAGES).map(m => m.message);

  it('deve garantir que getFriendlyErrorMessage sempre retorne uma mensagem de ERROR_MESSAGES', () => {
    // Testamos uma variedade de entradas (reais e simuladas)
    const testInputs = [
      { message: "Invalid login credentials" },
      { message: "User already registered" },
      { message: "Email not confirmed" },
      { message: "DESTINATION_EMAIL_IN_USE" },
      { message: "VALIDATION_ERROR" },
      "Random error string",
      null,
      undefined,
      new Error("Database error e-mail de destino"),
    ];

    testInputs.forEach(input => {
      const result = getFriendlyErrorMessage(input);
      expect(validMessages).toContain(result.message);
    });
  });

  it('todas as constantes de ERROR_MESSAGES devem estar em português e seguir o padrão', () => {
    Object.entries(ERROR_MESSAGES).forEach(([key, value]) => {
      // Verifica se não há caracteres típicos de mensagens em inglês não traduzidas
      const forbiddenWords = ['Error', 'Exception', 'Invalid', 'Failed', 'Not found'];
      
      // Permitimos apenas se for parte de um código de erro entre parênteses (ex: (VALIDATION_ERROR))
      const cleanMessage = value.message.replace(/\(.*\)/g, '');
      
      forbiddenWords.forEach(word => {
        expect(cleanMessage.toLowerCase()).not.toContain(word.toLowerCase());
      });

      // Garante que termina com ponto final
      expect(value.message.endsWith('.')).toBe(true);
    });
  });
});
