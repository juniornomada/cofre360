import { describe, it, expect } from "vitest";
import { getFriendlyErrorMessage } from "./utils";

describe("getFriendlyErrorMessage", () => {
  it("should return the friendly message for DESTINATION_EMAIL_IN_USE", () => {
    const error = { message: "Error: DESTINATION_EMAIL_IN_USE" };
    const friendlyMessage = getFriendlyErrorMessage(error);
    expect(friendlyMessage).toBe(
      "O e-mail de destino já está em uso por outro usuário. Por favor, utilize um e-mail diferente."
    );
  });

  it("should return the friendly message for SOURCE_EMAIL_NOT_FOUND", () => {
    const error = { message: "Error: SOURCE_EMAIL_NOT_FOUND" };
    const friendlyMessage = getFriendlyErrorMessage(error);
    expect(friendlyMessage).toBe("O e-mail de origem não foi encontrado no sistema.");
  });

  it("should return a clear message for generic destination email conflicts", () => {
    const error = { message: "violates unique constraint on e-mail de destino" };
    const friendlyMessage = getFriendlyErrorMessage(error);
    expect(friendlyMessage).toBe(
      "Não foi possível completar a operação: o campo de e-mail de destino apresenta um conflito."
    );
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
