import { describe, it, expect } from "vitest";
import { mapServerError } from "../map-server-error";

describe("mapServerError", () => {
  it("retorna 'Erro desconhecido' para null/undefined sem fallback", () => {
    expect(mapServerError(null)).toBe("Erro desconhecido");
    expect(mapServerError(undefined)).toBe("Erro desconhecido");
  });

  it("usa fallback quando não há mensagem", () => {
    expect(mapServerError(null, "Erro ao salvar")).toBe(
      "Erro ao salvar. Erro desconhecido."
    );
  });

  it("extrai mensagem de Error", () => {
    expect(mapServerError(new Error("boom"))).toBe("boom");
    expect(mapServerError(new Error("boom"), "Erro ao salvar")).toBe(
      "Erro ao salvar: boom"
    );
  });

  it("extrai mensagem de objeto Supabase { message }", () => {
    expect(mapServerError({ message: "duplicate key value" })).toBe(
      "Este registro já existe."
    );
  });

  it("classifica falhas de rede", () => {
    expect(mapServerError(new Error("Failed to fetch"))).toMatch(/Sem conexão/);
  });

  it("classifica RLS/permissão", () => {
    expect(
      mapServerError({ message: "new row violates row-level security policy" })
    ).toMatch(/permissão/);
  });

  it("classifica timeout", () => {
    expect(mapServerError({ message: "ETIMEDOUT" })).toMatch(/demorou/);
  });

  it("classifica foreign key", () => {
    expect(
      mapServerError({ message: "violates foreign key constraint" })
    ).toMatch(/dados vinculados/);
  });

  it("classifica campos obrigatórios (not null)", () => {
    expect(mapServerError({ code: "23502", message: "null value in column" })).toMatch(
      /obrigatórios/
    );
  });

  it("aceita string simples", () => {
    expect(mapServerError("mensagem crua")).toBe("mensagem crua");
  });

  it("faz nested lookup em { error: { message } }", () => {
    expect(mapServerError({ error: { message: "Failed to fetch" } })).toMatch(
      /Sem conexão/
    );
  });

  it("nunca lança para valores exóticos", () => {
    expect(() => mapServerError(Symbol("x"))).not.toThrow();
    expect(() => mapServerError(123)).not.toThrow();
    expect(() => mapServerError({ foo: "bar" })).not.toThrow();
  });
});
