import { describe, it, expect } from "vitest";
import { getFriendlyErrorMessage } from "./utils";

describe("getFriendlyErrorMessage", () => {
  it("should return the friendly message for DESTINATION_EMAIL_IN_USE", () => {
    const error = { message: "Error: DESTINATION_EMAIL_IN_USE" };
    const friendlyMessage = getFriendlyErrorMessage(error);
    expect(friendlyMessage).toBe(
      "O e-mail de destino já está em uso (DESTINATION_EMAIL_IN_USE). Por favor, utilize um endereço diferente."
    );
  });

  it("should return the friendly message for SOURCE_EMAIL_NOT_FOUND", () => {
    const error = { message: "Error: SOURCE_EMAIL_NOT_FOUND" };
    const friendlyMessage = getFriendlyErrorMessage(error);
    expect(friendlyMessage).toBe("O e-mail de origem não foi encontrado no sistema (SOURCE_EMAIL_NOT_FOUND).");
  });

  it("should return the friendly message for INVALID_EMAIL_FORMAT", () => {
    const error = { message: "Error: INVALID_EMAIL_FORMAT" };
    const friendlyMessage = getFriendlyErrorMessage(error);
    expect(friendlyMessage).toBe("O formato do e-mail informado é inválido (INVALID_EMAIL_FORMAT).");
  });

  it("should return the friendly message for INSUFFICIENT_PERMISSIONS", () => {
    const error = { message: "Error: INSUFFICIENT_PERMISSIONS" };
    const friendlyMessage = getFriendlyErrorMessage(error);
    expect(friendlyMessage).toBe("Você não tem permissão para realizar esta operação (INSUFFICIENT_PERMISSIONS).");
  });

  it("should return the friendly message for validation errors", () => {
    expect(getFriendlyErrorMessage({ message: "Error: VALIDATION_ERROR" })).toBe("Houve um erro de validação nos dados enviados (VALIDATION_ERROR). Verifique os campos e tente novamente.");
    expect(getFriendlyErrorMessage({ message: "Error: REQUIRED_FIELD_MISSING" })).toBe("Um ou mais campos obrigatórios não foram preenchidos (REQUIRED_FIELD_MISSING).");
    expect(getFriendlyErrorMessage({ message: "Error: INVALID_DATA_TYPE" })).toBe("Os dados fornecidos possuem um formato incompatível (INVALID_DATA_TYPE).");
  });

  it("should confirm blocked field appears for destination email conflicts", () => {
    const error = { message: "Error: violates unique constraint on e-mail de destino" };
    expect(getFriendlyErrorMessage(error)).toBe("Identificamos um conflito no campo de e-mail de destino.");
  });

  it("should map common Supabase auth errors", () => {
    expect(getFriendlyErrorMessage({ message: "Invalid login credentials" })).toBe("E-mail ou senha incorretos. Por favor, verifique seus dados.");
    expect(getFriendlyErrorMessage({ message: "User already registered" })).toBe("Este e-mail já está cadastrado no sistema.");
    expect(getFriendlyErrorMessage({ message: "Email not confirmed" })).toBe("Por favor, confirme seu e-mail antes de acessar a conta.");
  });

  it("should return a generic friendly message if no mapping is found", () => {
    const error = { message: "Some unknown database error code 12345" };
    const friendlyMessage = getFriendlyErrorMessage(error);
    expect(friendlyMessage).toBe("Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.");
  });

  it("should return a generic friendly message for technical error objects", () => {
    const technicalError = { code: "500", detail: "Database connection lost" };
    const friendlyMessage = getFriendlyErrorMessage(technicalError);
    expect(friendlyMessage).toBe("Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.");
  });

  it("should return a default message if error is null", () => {
    const friendlyMessage = getFriendlyErrorMessage(null);
    expect(friendlyMessage).toBe("Ocorreu um erro inesperado. Por favor, tente novamente.");
  });
});
