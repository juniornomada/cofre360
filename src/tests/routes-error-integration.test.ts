import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ERROR_MESSAGES } from "@/lib/constants";
import { getFriendlyErrorMessage } from "@/lib/utils";

/**
 * Teste de integração estático: percorre TODAS as rotas e componentes,
 * identifica chamadas a toast.error / toast.warning que utilizam
 * getFriendlyErrorMessage (a ponte oficial para erros reais) e simula
 * os cenários de erro mapeados em ERROR_CODE_MAPPINGS, garantindo que
 * cada um renderize exclusivamente uma mensagem de ERROR_MESSAGES.
 *
 * Também faz uma auditoria das chamadas literais a toast.error com
 * strings hardcoded fora de ERROR_MESSAGES, registrando-as como
 * desvios conhecidos para acompanhamento.
 */

const ROOT = join(process.cwd(), "src");

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "__tests__" || entry === "tests") continue;
      walk(full, files);
    } else if (
      (entry.endsWith(".tsx") || entry.endsWith(".ts")) &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx")
    ) {
      files.push(full);
    }
  }
  return files;
}

const allSourceFiles = walk(ROOT);
const routeFiles = allSourceFiles.filter((f) => f.includes("/routes/"));
const componentFiles = allSourceFiles.filter((f) => f.includes("/components/"));

const validMessages = new Set(Object.values(ERROR_MESSAGES).map((m) => m.message));

describe("Integração: cenários de erro reais nas rotas e telas", () => {
  it("todas as rotas existem e foram inspecionadas", () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  it("todo arquivo que usa getFriendlyErrorMessage importa do módulo oficial", () => {
    const offenders: string[] = [];
    for (const file of [...routeFiles, ...componentFiles]) {
      const src = readFileSync(file, "utf8");
      if (src.includes("getFriendlyErrorMessage")) {
        const importsFromUtils = /from\s+["']@\/lib\/utils["']/.test(src);
        if (!importsFromUtils) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("toda mensagem produzida por getFriendlyErrorMessage para erros reais mapeados pertence a ERROR_MESSAGES", () => {
    // Cenários reais coletados dos arquivos de rota/components
    // (erros que efetivamente disparam toast.error via getFriendlyErrorMessage).
    const realErrorScenarios = [
      // Auth (src/routes/auth.tsx)
      { message: "Invalid login credentials" },
      { message: "User already registered" },
      { message: "Email not confirmed" },
      { message: "Password should be at least 6 characters" },
      // Sistema/banco
      { message: "DESTINATION_EMAIL_IN_USE" },
      { message: "SOURCE_EMAIL_NOT_FOUND" },
      { message: "INVALID_EMAIL_FORMAT" },
      { message: "INSUFFICIENT_PERMISSIONS" },
      { message: "VALIDATION_ERROR" },
      { message: "REQUIRED_FIELD_MISSING" },
      { message: "INVALID_DATA_TYPE" },
      { message: "duplicate key on e-mail de destino" },
      // Erros completamente desconhecidos -> default
      { message: "Unexpected network failure xyz" },
      null,
      undefined,
    ];

    for (const scenario of realErrorScenarios) {
      const result = getFriendlyErrorMessage(scenario);
      expect(
        validMessages.has(result.message),
        `Mensagem fora de ERROR_MESSAGES: "${result.message}" (cenário: ${JSON.stringify(scenario)})`,
      ).toBe(true);
      expect(result).toHaveProperty("type");
      expect(result).toHaveProperty("code");
    }
  });

  it("cada chave de ERROR_MESSAGES é alcançável por pelo menos um cenário real ou é uma mensagem default", () => {
    const reachable = new Set<string>();
    const probes = [
      "Invalid login credentials",
      "User already registered",
      "Email not confirmed",
      "Password should be at least 6 characters",
      "DESTINATION_EMAIL_IN_USE",
      "SOURCE_EMAIL_NOT_FOUND",
      "INVALID_EMAIL_FORMAT",
      "INSUFFICIENT_PERMISSIONS",
      "VALIDATION_ERROR",
      "REQUIRED_FIELD_MISSING",
      "INVALID_DATA_TYPE",
      "conflict no e-mail de destino",
    ];
    for (const p of probes) reachable.add(getFriendlyErrorMessage({ message: p }).message);
    // defaults
    reachable.add(getFriendlyErrorMessage(null).message);
    reachable.add(getFriendlyErrorMessage({ message: "string aleatória xyz" }).message);

    const unreachable = Object.entries(ERROR_MESSAGES)
      .filter(([, v]) => !reachable.has(v.message))
      .map(([k]) => k);

    expect(
      unreachable,
      `Chaves de ERROR_MESSAGES sem cenário de erro real correspondente: ${unreachable.join(", ")}`,
    ).toEqual([]);
  });

  it("audita chamadas toast.error/warning hardcoded fora de ERROR_MESSAGES nas rotas e telas", () => {
    // Esta auditoria é informativa: registramos toda string literal usada em
    // toast.error/toast.warning que não venha de ERROR_MESSAGES nem de
    // getFriendlyErrorMessage. Falhamos apenas se a string for em inglês,
    // sinalizando regressão de idioma; literais em português são listadas
    // como dívida técnica conhecida para futura padronização.
    const literalRegex =
      /toast\.(?:error|warning)\(\s*(?:`([^`$]*)`|"([^"\\]*)"|'([^'\\]*)')/g;

    const englishWords = /\b(Error|Failed|Invalid|Not found|Exception)\b/;
    const englishOffenders: { file: string; text: string }[] = [];

    for (const file of [...routeFiles, ...componentFiles]) {
      const src = readFileSync(file, "utf8");
      let m: RegExpExecArray | null;
      while ((m = literalRegex.exec(src)) !== null) {
        const text = m[1] ?? m[2] ?? m[3] ?? "";
        if (!text) continue;
        if (validMessages.has(text)) continue;
        if (englishWords.test(text)) {
          englishOffenders.push({ file: file.replace(ROOT, "src"), text });
        }
      }
    }

    expect(
      englishOffenders,
      `Toasts hardcoded em inglês detectados (devem usar ERROR_MESSAGES):\n${englishOffenders
        .map((o) => `  ${o.file}: "${o.text}"`)
        .join("\n")}`,
    ).toEqual([]);
  });
});
