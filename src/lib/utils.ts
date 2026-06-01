import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

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
  if (!error) return "Ocorreu um erro inesperado.";

  const message = error.message || String(error);

  // Mapeamento de códigos específicos do sistema
  if (message.includes("DESTINATION_EMAIL_IN_USE")) {
    return "E-mail de destino já está em uso (DESTINATION_EMAIL_IN_USE). Por favor, utilize um e-mail diferente.";
  }

  if (message.includes("SOURCE_EMAIL_NOT_FOUND")) {
    return "E-mail de origem não encontrado (SOURCE_EMAIL_NOT_FOUND).";
  }

  if (message.includes("INVALID_EMAIL_FORMAT")) {
    return "O formato do e-mail é inválido (INVALID_EMAIL_FORMAT).";
  }

  if (message.includes("INSUFFICIENT_PERMISSIONS")) {
    return "Você não tem permissão para realizar esta operação (INSUFFICIENT_PERMISSIONS).";
  }

  // Mapeamento de erros comuns do Supabase/Auth
  if (message.includes("Invalid login credentials")) {
    return "E-mail ou senha incorretos.";
  }

  if (message.includes("User already registered")) {
    return "Este e-mail já está cadastrado.";
  }

  if (message.includes("Email not confirmed")) {
    return "Por favor, confirme seu e-mail antes de acessar.";
  }

  if (message.includes("Password should be at least 6 characters")) {
    return "A senha deve ter pelo menos 6 caracteres.";
  }

  // Tratamento genérico para erros de constraint ou mensagens do banco
  if (message.includes("e-mail de destino")) {
    return "Conflito no campo: e-mail de destino.";
  }

  return message;
}
