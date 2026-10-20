import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isStaleAppChunkError } from "@/lib/route-error-recovery";

describe("Recuperação de tela após atualização do aplicativo", () => {
  it("reconhece importação de módulo antigo indisponível no Chrome mobile", () => {
    expect(isStaleAppChunkError(new TypeError(
      "Failed to fetch dynamically imported module: https://cofre360.vercel.app/assets/transactions-old.js",
    ))).toBe(true);
    expect(isStaleAppChunkError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isStaleAppChunkError(new Error("Loading chunk 912 failed."))).toBe(true);
    expect(isStaleAppChunkError({ name: "ChunkLoadError", message: "" })).toBe(true);
    expect(isStaleAppChunkError({ name: "Error", message: "fetch failed", cause: new Error("Failed to load module script") })).toBe(true);
  });

  it("não confunde falha de banco ou de renderização com chunk antigo", () => {
    expect(isStaleAppChunkError(new TypeError("Cannot read properties of undefined (reading 'date')"))).toBe(false);
    expect(isStaleAppChunkError(new Error("PGRST116"))).toBe(false);
    expect(isStaleAppChunkError(new Error("Failed to fetch"))).toBe(false);
    expect(isStaleAppChunkError(null)).toBe(false);
  });

  it("mantém opção de tentar novamente e recarga integral, sem alterar dados", () => {
    const router = readFileSync(resolve(process.cwd(), "src/router.tsx"), "utf8");
    expect(router).toContain("isStaleAppChunkError(error)");
    expect(router).toContain("window.location.reload()");
    expect(router).toContain("void router.invalidate()");
    expect(router).toContain("reset()");
    expect(router).toContain("Atualizar aplicativo");
    expect(router).toContain("Recarregar página");
    expect(router).toContain('href="/home"');
    expect(router).not.toContain("Something went wrong");
  });
});
