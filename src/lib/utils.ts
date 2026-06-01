import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { ERROR_MESSAGES, ERROR_CODE_MAPPINGS, type FriendlyError } from "./constants"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Remove acentos de uma string
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Mapeia erros técnicos do Supabase para mensagens amigáveis em português
 */
export function getFriendlyErrorMessage(error: any): FriendlyError {
  const getBaseError = () => {
    if (!error) return ERROR_MESSAGES.DEFAULT_UNEXPECTED;

    const message = error.message || String(error);

    // Mapeamento dinâmico baseado no módulo de constantes
    for (const mapping of ERROR_CODE_MAPPINGS) {
      if (message.includes(mapping.pattern)) {
        return ERROR_MESSAGES[mapping.key];
      }
    }

    return ERROR_MESSAGES.DEFAULT_PROCESSING;
  };

  const baseError = getBaseError();
  return {
    ...baseError,
    code: error?.code || null
  };
}

  const baseError = getBaseError();
  return {
    ...baseError,
    code: error?.code || null
  };
}
