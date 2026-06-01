export const ERROR_MESSAGES = {
  DEFAULT_UNEXPECTED: "Ocorreu um erro inesperado. Por favor, tente novamente.",
  DEFAULT_PROCESSING: "Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.",
  
  // Códigos específicos do sistema
  DESTINATION_EMAIL_IN_USE: "O e-mail de destino já está em uso (DESTINATION_EMAIL_IN_USE). Por favor, utilize um endereço diferente.",
  SOURCE_EMAIL_NOT_FOUND: "O e-mail de origem não foi encontrado no sistema (SOURCE_EMAIL_NOT_FOUND).",
  INVALID_EMAIL_FORMAT: "O formato do e-mail informado é inválido (INVALID_EMAIL_FORMAT).",
  INSUFFICIENT_PERMISSIONS: "Você não tem permissão para realizar esta operação (INSUFFICIENT_PERMISSIONS).",
  
  // Códigos de validação
  VALIDATION_ERROR: "Houve um erro de validação nos dados enviados (VALIDATION_ERROR). Verifique os campos e tente novamente.",
  REQUIRED_FIELD_MISSING: "Um ou mais campos obrigatórios não foram preenchidos (REQUIRED_FIELD_MISSING).",
  INVALID_DATA_TYPE: "Os dados fornecidos possuem um formato incompatível (INVALID_DATA_TYPE).",
  
  // Erros comuns de Auth/Supabase
  INVALID_CREDENTIALS: "E-mail ou senha incorretos. Por favor, verifique seus dados.",
  USER_ALREADY_REGISTERED: "Este e-mail já está cadastrado no sistema.",
  EMAIL_NOT_CONFIRMED: "Por favor, confirme seu e-mail antes de acessar a conta.",
  PASSWORD_TOO_SHORT: "A senha deve conter pelo menos 6 caracteres.",
  
  // Conflitos específicos de banco
  DESTINATION_EMAIL_CONFLICT: "Identificamos um conflito no campo de e-mail de destino."
} as const;
