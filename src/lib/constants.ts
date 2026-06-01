export interface FriendlyError {
  message: string;
  code: string | null;
  type: "validation" | "auth" | "system" | "unknown";
}

export const ERROR_MESSAGES: Record<string, Omit<FriendlyError, "code">> = {
  DEFAULT_UNEXPECTED: {
    message: "Ocorreu um erro inesperado. Por favor, tente novamente.",
    type: "unknown"
  },
  DEFAULT_PROCESSING: {
    message: "Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.",
    type: "unknown"
  },
  
  // Códigos específicos do sistema
  DESTINATION_EMAIL_IN_USE: {
    message: "O e-mail de destino já está em uso (DESTINATION_EMAIL_IN_USE). Por favor, utilize um endereço diferente.",
    type: "validation"
  },
  SOURCE_EMAIL_NOT_FOUND: {
    message: "O e-mail de origem não foi encontrado no sistema (SOURCE_EMAIL_NOT_FOUND).",
    type: "validation"
  },
  INVALID_EMAIL_FORMAT: {
    message: "O formato do e-mail informado é inválido (INVALID_EMAIL_FORMAT).",
    type: "validation"
  },
  INSUFFICIENT_PERMISSIONS: {
    message: "Você não tem permissão para realizar esta operação (INSUFFICIENT_PERMISSIONS).",
    type: "system"
  },
  
  // Códigos de validação
  VALIDATION_ERROR: {
    message: "Houve um erro de validação nos dados enviados (VALIDATION_ERROR). Verifique os campos e tente novamente.",
    type: "validation"
  },
  REQUIRED_FIELD_MISSING: {
    message: "Um ou mais campos obrigatórios não foram preenchidos (REQUIRED_FIELD_MISSING).",
    type: "validation"
  },
  INVALID_DATA_TYPE: {
    message: "Os dados fornecidos possuem um formato incompatível (INVALID_DATA_TYPE).",
    type: "validation"
  },
  
  // Erros comuns de Auth/Supabase
  INVALID_CREDENTIALS: {
    message: "E-mail ou senha incorretos. Por favor, verifique seus dados.",
    type: "auth"
  },
  USER_ALREADY_REGISTERED: {
    message: "Este e-mail já está cadastrado no sistema.",
    type: "auth"
  },
  EMAIL_NOT_CONFIRMED: {
    message: "Por favor, confirme seu e-mail antes de acessar a conta.",
    type: "auth"
  },
  PASSWORD_TOO_SHORT: {
    message: "A senha deve conter pelo menos 6 caracteres.",
    type: "auth"
  },
  
  // Conflitos específicos de banco
  DESTINATION_EMAIL_CONFLICT: {
    message: "Identificamos um conflito no campo de e-mail de destino.",
    type: "validation"
  }
} as const;

