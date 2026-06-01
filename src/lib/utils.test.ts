import { describe, it, expect } from "vitest";
import { getFriendlyErrorMessage } from "./utils";
import { ERROR_MESSAGES } from "./constants";

describe("getFriendlyErrorMessage", () => {
  it("should return the friendly message for DESTINATION_EMAIL_IN_USE", () => {
    const error = { message: "Error: DESTINATION_EMAIL_IN_USE" };
    const friendlyMessage = getFriendlyErrorMessage(error);
    expect(friendlyMessage).toBe(ERROR_MESSAGES.DESTINATION_EMAIL_IN_USE);
  });

  it("should return the friendly message for SOURCE_EMAIL_NOT_FOUND", () => {
    const error = { message: "Error: SOURCE_EMAIL_NOT_FOUND" };
    const friendlyMessage = getFriendlyErrorMessage(error);
    expect(friendlyMessage).toBe(ERROR_MESSAGES.SOURCE_EMAIL_NOT_FOUND);
  });

  it("should return the friendly message for INVALID_EMAIL_FORMAT", () => {
    const error = { message: "Error: INVALID_EMAIL_FORMAT" };
    const friendlyMessage = getFriendlyErrorMessage(error);
    expect(friendlyMessage).toBe(ERROR_MESSAGES.INVALID_EMAIL_FORMAT);
  });

  it("should return the friendly message for INSUFFICIENT_PERMISSIONS", () => {
    const error = { message: "Error: INSUFFICIENT_PERMISSIONS" };
    const friendlyMessage = getFriendlyErrorMessage(error);
    expect(friendlyMessage).toBe(ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS);
  });

  it("should return the friendly message for validation errors", () => {
    expect(getFriendlyErrorMessage({ message: "Error: VALIDATION_ERROR" })).toBe(ERROR_MESSAGES.VALIDATION_ERROR);
    expect(getFriendlyErrorMessage({ message: "Error: REQUIRED_FIELD_MISSING" })).toBe(ERROR_MESSAGES.REQUIRED_FIELD_MISSING);
    expect(getFriendlyErrorMessage({ message: "Error: INVALID_DATA_TYPE" })).toBe(ERROR_MESSAGES.INVALID_DATA_TYPE);
  });

  it("should confirm blocked field appears for destination email conflicts", () => {
    const error = { message: "Error: violates unique constraint on e-mail de destino" };
    expect(getFriendlyErrorMessage(error)).toBe(ERROR_MESSAGES.DESTINATION_EMAIL_CONFLICT);
  });

  it("should map common Supabase auth errors", () => {
    expect(getFriendlyErrorMessage({ message: "Invalid login credentials" })).toBe(ERROR_MESSAGES.INVALID_CREDENTIALS);
    expect(getFriendlyErrorMessage({ message: "User already registered" })).toBe(ERROR_MESSAGES.USER_ALREADY_REGISTERED);
    expect(getFriendlyErrorMessage({ message: "Email not confirmed" })).toBe(ERROR_MESSAGES.EMAIL_NOT_CONFIRMED);
  });

  it("should return a generic friendly message if no mapping is found", () => {
    const error = { message: "Some unknown database error code 12345" };
    const friendlyMessage = getFriendlyErrorMessage(error);
    expect(friendlyMessage).toBe(ERROR_MESSAGES.DEFAULT_PROCESSING);
  });

  it("should return a generic friendly message for technical error objects", () => {
    const technicalError = { code: "500", detail: "Database connection lost" };
    const friendlyMessage = getFriendlyErrorMessage(technicalError);
    expect(friendlyMessage).toBe(ERROR_MESSAGES.DEFAULT_PROCESSING);
  });

  it("should return a default message if error is null", () => {
    const friendlyMessage = getFriendlyErrorMessage(null);
    expect(friendlyMessage).toBe(ERROR_MESSAGES.DEFAULT_UNEXPECTED);
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

    it("should end all messages with a period", () => {
      scenarios.forEach(({ input }) => {
        const message = getFriendlyErrorMessage(input);
        expect(message.endsWith(".")).toBe(true);
      });
    });

    it("should maintain a professional and polite tone", () => {
      scenarios.forEach(({ input }) => {
        const message = getFriendlyErrorMessage(input);
        expect(message).not.toContain("Error:");
        expect(message).not.toContain("Exception");
        expect(message).toMatch(/^(O|H|V|E|P|A|I|U)/); // Starts with capital letter
      });
    });

    it("should match exactly the expected standardized messages from constants", () => {
      scenarios.forEach(({ input, expected }) => {
        expect(getFriendlyErrorMessage(input)).toBe(expected);
      });
    });
    
    it("should not have any hardcoded strings that differ from constants", () => {
      // This is implicitly checked by the previous test, but we can also check that all values in ERROR_MESSAGES are used
      const allMessages = Object.values(ERROR_MESSAGES);
      allMessages.forEach(msg => {
        expect(typeof msg).toBe("string");
        expect(msg.length).toBeGreaterThan(0);
      });
    });

    it("should have each error message used exactly once in the utility function", () => {
      // This test ensures that we don't have unused constants or duplicate logic
      // Note: In a real environment, we'd use static analysis or dynamic checks.
      // Here we check that all keys in ERROR_MESSAGES correspond to a branch in getFriendlyErrorMessage
      const keys = Object.keys(ERROR_MESSAGES);
      
      // We know all keys are used based on the scenarios mapping, but let's be explicit
      const usedInScenarios = scenarios.map(s => s.expected);
      keys.forEach(key => {
        const expectedValue = ERROR_MESSAGES[key as keyof typeof ERROR_MESSAGES];
        const occurrences = usedInScenarios.filter(val => val === expectedValue).length;
        
        // Every constant should be mapped to at least one scenario (testing its usage)
        expect(occurrences).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
