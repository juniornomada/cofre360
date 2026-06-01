import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { ERROR_MESSAGES } from "./constants"

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
export function getFriendlyErrorMessage(error: any): string {
  if (!error) return ERROR_MESSAGES.DEFAULT_UNEXPECTED;

  const message = error.message || String(error);

  // Mapeamento de códigos específicos do sistema
  if (message.includes("DESTINATION_EMAIL_IN_USE")) return ERROR_MESSAGES.DESTINATION_EMAIL_IN_USE;
  if (message.includes("SOURCE_EMAIL_NOT_FOUND")) return ERROR_MESSAGES.SOURCE_EMAIL_NOT_FOUND;
  if (message.includes("INVALID_EMAIL_FORMAT")) return ERROR_MESSAGES.INVALID_EMAIL_FORMAT;
  if (message.includes("INSUFFICIENT_PERMISSIONS")) return ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS;

  // Mapeamento de códigos de validação do back-end
  if (message.includes("VALIDATION_ERROR")) return ERROR_MESSAGES.VALIDATION_ERROR;
  if (message.includes("REQUIRED_FIELD_MISSING")) return ERROR_MESSAGES.REQUIRED_FIELD_MISSING;
  if (message.includes("INVALID_DATA_TYPE")) return ERROR_MESSAGES.INVALID_DATA_TYPE;

  // Mapeamento de erros comuns do Supabase/Auth
  if (message.includes("Invalid login credentials")) return ERROR_MESSAGES.INVALID_CREDENTIALS;
  if (message.includes("User already registered")) return ERROR_MESSAGES.USER_ALREADY_REGISTERED;
  if (message.includes("Email not confirmed")) return ERROR_MESSAGES.EMAIL_NOT_CONFIRMED;
  if (message.includes("Password should be at least 6 characters")) return ERROR_MESSAGES.PASSWORD_TOO_SHORT;

  // Tratamento genérico para erros de constraint ou mensagens do banco
  if (message.includes("e-mail de destino")) return ERROR_MESSAGES.DESTINATION_EMAIL_CONFLICT;

  return ERROR_MESSAGES.DEFAULT_PROCESSING;
}
