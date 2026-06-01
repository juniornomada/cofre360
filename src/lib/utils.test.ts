import { describe, it, expect } from "vitest";
import { getFriendlyErrorMessage } from "./utils";
import { ERROR_MESSAGES, ERROR_CODE_MAPPINGS } from "./constants";

describe("getFriendlyErrorMessage", () => {
  it("should return a structured object for DESTINATION_EMAIL_IN_USE", () => {
    const error = { message: "Error: DESTINATION_EMAIL_IN_USE", code: "P2002" };
    const friendly = getFriendlyErrorMessage(error);
    expect(friendly).toEqual({
      ...ERROR_MESSAGES.DESTINATION_EMAIL_IN_USE,
      code: "P2002"
    });
  });

  it("should return a structured object for validation errors", () => {
    const error = { message: "Error: VALIDATION_ERROR" };
    const friendly = getFriendlyErrorMessage(error);
    expect(friendly).toEqual({
      ...ERROR_MESSAGES.VALIDATION_ERROR,
      code: null
    });
  });

  it("should return a structured object for unknown errors", () => {
    const error = { message: "Unknown thing", code: "500" };
    const friendly = getFriendlyErrorMessage(error);
    expect(friendly).toEqual({
      ...ERROR_MESSAGES.DEFAULT_PROCESSING,
      code: "500"
    });
  });

  it("should return a default structured object if error is null", () => {
    const friendly = getFriendlyErrorMessage(null);
    expect(friendly).toEqual({
      ...ERROR_MESSAGES.DEFAULT_UNEXPECTED,
      code: null
    });
  });

  describe("consistency and tone", () => {
    const scenarios = [
      { input: null, expected: ERROR_MESSAGES.DEFAULT_UNEXPECTED },
      { input: { message: "DESTINATION_EMAIL_IN_USE" }, expected: ERROR_MESSAGES.DESTINATION_EMAIL_IN_USE },
      { input: { message: "SOURCE_EMAIL_NOT_FOUND" }, expected: ERROR_MESSAGES.SOURCE_EMAIL_NOT_FOUND },
      { input: { message: "INVALID_EMAIL_FORMAT" }, expected: ERROR_MESSAGES.INVALID_EMAIL_FORMAT },
      { input: { message: "INSUFFICIENT_PERMISSIONS" }, expected: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS },
      { input: { message: "VALIDATION_ERROR" }, expected: ERROR_MESSAGES.VALIDATION_ERROR },
      { input: { message: "REQUIRED_FIELD_MISSING" }, expected: ERROR_MESSAGES.REQUIRED_FIELD_MISSING },
      { input: { message: "INVALID_DATA_TYPE" }, expected: ERROR_MESSAGES.INVALID_DATA_TYPE },
      { input: { message: "Invalid login credentials" }, expected: ERROR_MESSAGES.INVALID_CREDENTIALS },
      { input: { message: "User already registered" }, expected: ERROR_MESSAGES.USER_ALREADY_REGISTERED },
      { input: { message: "Email not confirmed" }, expected: ERROR_MESSAGES.EMAIL_NOT_CONFIRMED },
      { input: { message: "Password should be at least 6 characters" }, expected: ERROR_MESSAGES.PASSWORD_TOO_SHORT },
      { input: { message: "e-mail de destino" }, expected: ERROR_MESSAGES.DESTINATION_EMAIL_CONFLICT },
      { input: { message: "UNKNOWN_ERROR" }, expected: ERROR_MESSAGES.DEFAULT_PROCESSING }
    ];

    it("should end all messages with a period and have a valid type", () => {
      scenarios.forEach(({ input }) => {
        const result = getFriendlyErrorMessage(input);
        expect(result.message.endsWith(".")).toBe(true);
        expect(["validation", "auth", "system", "unknown"]).toContain(result.type);
      });
    });

    it("should maintain a professional and polite tone", () => {
      scenarios.forEach(({ input }) => {
        const result = getFriendlyErrorMessage(input);
        expect(result.message).not.toContain("Error:");
        expect(result.message).not.toContain("Exception");
        expect(result.message).toMatch(/^(O|H|V|E|P|A|I|U)/);
      });
    });

    it("should match exactly the expected standardized objects from constants", () => {
      scenarios.forEach(({ input, expected }) => {
        const result = getFriendlyErrorMessage(input);
        expect(result.message).toBe(expected.message);
        expect(result.type).toBe(expected.type);
      });
    });
    
    it("should have each error message configuration used at least once in tests", () => {
      const allExpectedMessages = scenarios.map(s => s.expected.message);
      const constantMessages = Object.values(ERROR_MESSAGES).map(m => m.message);
      
      constantMessages.forEach(msg => {
        expect(allExpectedMessages).toContain(msg);
      });
    });
  });
});
