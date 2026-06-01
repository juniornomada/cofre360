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

  if (message.includes("DESTINATION_EMAIL_IN_USE")) {
    return "O e-mail de destino já está em uso por outro usuário. Por favor, utilize um e-mail diferente.";
  }

  if (message.includes("SOURCE_EMAIL_NOT_FOUND")) {
    return "O e-mail de origem não foi encontrado no sistema.";
  }

  // Tratamento genérico para erros de constraint ou mensagens do banco
  if (message.includes("e-mail de destino")) {
    return "Não foi possível completar a operação: o campo de e-mail de destino apresenta um conflito.";
  }

  return message;
}
