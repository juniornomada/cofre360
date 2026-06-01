import { describe, it, expect } from "vitest";
import { getFriendlyErrorMessage } from "./utils";

describe("getFriendlyErrorMessage", () => {
  it("should return the friendly message for DESTINATION_EMAIL_IN_USE", () => {
    const error = { message: "Error: DESTINATION_EMAIL_IN_USE" };
    const friendlyMessage = getFriendlyErrorMessage(error);
    expect(friendlyMessage).toBe(
      "E-mail de destino já está em uso (DESTINATION_EMAIL_IN_USE). Por favor, utilize um e-mail diferente."
    );
  });

  it("should return the friendly message for SOURCE_EMAIL_NOT_FOUND", () => {
    const error = { message: "Error: SOURCE_EMAIL_NOT_FOUND" };
    const friendlyMessage = getFriendlyErrorMessage(error);
    expect(friendlyMessage).toBe("E-mail de origem não encontrado (SOURCE_EMAIL_NOT_FOUND).");
  });

  it("should return the friendly message for INVALID_EMAIL_FORMAT", () => {
    const error = { message: "Error: INVALID_EMAIL_FORMAT" };
    const friendlyMessage = getFriendlyErrorMessage(error);
    expect(friendlyMessage).toBe("O formato do e-mail é inválido (INVALID_EMAIL_FORMAT).");
  });

  it("should return the friendly message for INSUFFICIENT_PERMISSIONS", () => {
    const error = { message: "Error: INSUFFICIENT_PERMISSIONS" };
    const friendlyMessage = getFriendlyErrorMessage(error);
    expect(friendlyMessage).toBe("Você não tem permissão para realizar esta operação (INSUFFICIENT_PERMISSIONS).");
  });

  it("should return the friendly message for validation errors", () => {
    expect(getFriendlyErrorMessage({ message: "Error: VALIDATION_ERROR" })).toBe("Erro de validação nos dados enviados (VALIDATION_ERROR). Verifique os campos.");
    expect(getFriendlyErrorMessage({ message: "Error: REQUIRED_FIELD_MISSING" })).toBe("Um ou mais campos obrigatórios estão faltando (REQUIRED_FIELD_MISSING).");
  });

  it("should map common Supabase auth errors", () => {
    expect(getFriendlyErrorMessage({ message: "Invalid login credentials" })).toBe("E-mail ou senha incorretos.");
    expect(getFriendlyErrorMessage({ message: "User already registered" })).toBe("Este e-mail já está cadastrado.");
    expect(getFriendlyErrorMessage({ message: "Email not confirmed" })).toBe("Por favor, confirme seu e-mail antes de acessar.");
  });

  it("should return a clear message for generic destination email conflicts", () => {
    const error = { message: "violates unique constraint on e-mail de destino" };
    const friendlyMessage = getFriendlyErrorMessage(error);
    expect(friendlyMessage).toBe("Conflito no campo: e-mail de destino.");
  });

  it("should return the original message if no mapping is found", () => {
    const error = { message: "Some unknown error occurred" };
    const friendlyMessage = getFriendlyErrorMessage(error);
    expect(friendlyMessage).toBe("Some unknown error occurred");
  });

  it("should return a default message if error is null", () => {
    const friendlyMessage = getFriendlyErrorMessage(null);
    expect(friendlyMessage).toBe("Ocorreu um erro inesperado.");
  });
});
