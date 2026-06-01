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
  if (!error) return "Ocorreu um erro inesperado. Por favor, tente novamente.";

  const message = error.message || String(error);

  // Mapeamento de códigos específicos do sistema
  if (message.includes("DESTINATION_EMAIL_IN_USE")) {
    return "O e-mail de destino já está em uso (DESTINATION_EMAIL_IN_USE). Por favor, utilize um endereço diferente.";
  }

  if (message.includes("SOURCE_EMAIL_NOT_FOUND")) {
    return "O e-mail de origem não foi encontrado no sistema (SOURCE_EMAIL_NOT_FOUND).";
  }

  if (message.includes("INVALID_EMAIL_FORMAT")) {
    return "O formato do e-mail informado é inválido (INVALID_EMAIL_FORMAT).";
  }

  if (message.includes("INSUFFICIENT_PERMISSIONS")) {
    return "Você não tem permissão para realizar esta operação (INSUFFICIENT_PERMISSIONS).";
  }

  // Mapeamento de códigos de validação do back-end
  if (message.includes("VALIDATION_ERROR")) {
    return "Houve um erro de validação nos dados enviados (VALIDATION_ERROR). Verifique os campos e tente novamente.";
  }

  if (message.includes("REQUIRED_FIELD_MISSING")) {
    return "Um ou mais campos obrigatórios não foram preenchidos (REQUIRED_FIELD_MISSING).";
  }

  if (message.includes("INVALID_DATA_TYPE")) {
    return "Os dados fornecidos possuem um formato incompatível (INVALID_DATA_TYPE).";
  }

  // Mapeamento de erros comuns do Supabase/Auth
  if (message.includes("Invalid login credentials")) {
    return "E-mail ou senha incorretos. Por favor, verifique seus dados.";
  }

  if (message.includes("User already registered")) {
    return "Este e-mail já está cadastrado no sistema.";
  }

  if (message.includes("Email not confirmed")) {
    return "Por favor, confirme seu e-mail antes de acessar a conta.";
  }

  if (message.includes("Password should be at least 6 characters")) {
    return "A senha deve conter pelo menos 6 caracteres.";
  }

  // Tratamento genérico para erros de constraint ou mensagens do banco
  if (message.includes("e-mail de destino")) {
    return "Identificamos um conflito no campo de e-mail de destino.";
  }

  return "Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.";
}
