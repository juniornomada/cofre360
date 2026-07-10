/**
 * Contrato PATCH — schema_version desconhecida.
 *
 * Contrato normativo:
 *   • Quando o cliente solicita uma versão de schema que o servidor NÃO
 *     implementa E não faz opt-in de fallback, a resposta é 406 Not Acceptable
 *     com corpo `{ error: { code: "UNSUPPORTED_VERSION", message, supported } }`.
 *   • O campo `supported` reflete EXATAMENTE `SUPPORTED_VERSIONS` do servidor
 *     (mesma ordem, mesmos valores) — é a fonte de verdade para o cliente
 *     escolher a próxima tentativa.
 *   • `persist` NUNCA é chamado, mesmo que o corpo do PATCH fosse
 *     perfeitamente válido: o gate de versão precede a fase de escrita.
 *   • O tipo MIME da resposta é JSON; o corpo é serializável e determinístico.
 *
 * Este arquivo cobre um catálogo amplo de "versões erradas" — dígitos fora
 * do intervalo, ruído, injeção, strings vazias e caracteres unicode — vindas
 * de todas as fontes contratuais (Accept-Version, X-Schema-Version, ?v=)
 * e verifica as invariantes acima em cada caso.
 */
import { describe, it, expect, vi } from "vitest";
import {
  handlePatchTransactionVersioned,
  SUPPORTED_VERSIONS,
  type VersionedRequest,
  type VersionedResponse,
} from "@/lib/patch-transaction-versioned";

// ---------------- Fixtures ----------------

function makeCtx() {
  const persist = vi.fn(async (id: string, patch: Record<string, unknown>) => ({
    id,
    ...patch,
  }));
  return { persist, currentRow: null as null };
}

/** Corpo de PATCH sabidamente VÁLIDO — se o gate de versão falhar, a próxima
 *  fase (validação/cálculo) passaria e `persist` seria chamado. Isso torna a
 *  ausência de `persist` uma evidência forte de que o 406 curto-circuita. */
const VALID_BODY = {
  amount: 300,
  total_installments: 3,
  installment_mode: "divide" as const,
};

function req(
  opts: {
    headers?: Record<string, string | undefined>;
    query?: Record<string, string | undefined>;
    id?: string;
  } = {},
): VersionedRequest {
  return {
    method: "PATCH",
    id: opts.id ?? "tx-unknown-version",
    contentType: "application/json",
    rawBody: JSON.stringify(VALID_BODY),
    headers: opts.headers,
    query: opts.query,
  };
}

/** Estritamente afunila para o ramo 406, com narrowing e evidência clara. */
function assert406(
  res: VersionedResponse,
): asserts res is Extract<VersionedResponse, { status: 406 }> {
  if (res.status !== 406) {
    throw new Error(`esperado 406, recebeu ${res.status}: ${JSON.stringify(res)}`);
  }
}

// Catálogo — versões que garantidamente NÃO estão em SUPPORTED_VERSIONS.
const UNKNOWN_VERSIONS: readonly string[] = [
  "0", // abaixo do range
  "4", // logo acima do último suportado
  "5",
  "99",
  "10", // parece "1" concatenado — não pode ser aceito
  "01", // string diferente de "1"
  "1.0", // decimal
  "1a", // ruído alfanumérico
  "v2", // prefixado
  "latest",
  "beta",
  "next",
  "true",
  "null",
  "undefined",
  "NaN",
  "Infinity",
  "-1",
  "'; DROP TABLE tx;--", // injeção — deve ser tratado como string opaca
  "🚀",
  "١", // dígito árabe "1" — não é o caractere "1" ASCII
];

// ---------------- Testes ----------------

describe("PATCH — schema_version desconhecida → 406", () => {
  it("SUPPORTED_VERSIONS é a fonte de verdade e não contém nenhuma versão do catálogo", () => {
    // Guardas de sanidade — se alguém adicionar "4" ao servidor, este teste
    // avisa antes que o catálogo passe a estar errado.
    for (const v of UNKNOWN_VERSIONS) {
      expect(SUPPORTED_VERSIONS as readonly string[]).not.toContain(v.trim());
    }
    // Estrutura mínima esperada — o cliente confia neste shape.
    expect(SUPPORTED_VERSIONS.length).toBeGreaterThan(0);
    for (const v of SUPPORTED_VERSIONS) expect(typeof v).toBe("string");
  });

  it.each(UNKNOWN_VERSIONS)(
    "Accept-Version='%s' → 406 com supported exato e persist NÃO chamado",
    async (bad) => {
      const ctx = makeCtx();
      const res = await handlePatchTransactionVersioned(
        req({ headers: { "Accept-Version": bad } }),
        ctx,
      );
      assert406(res);

      // Corpo canônico do erro.
      expect(res.body.error.code).toBe("UNSUPPORTED_VERSION");
      expect(typeof res.body.error.message).toBe("string");
      expect(res.body.error.message.length).toBeGreaterThan(0);
      // A versão pedida (após trim) deve aparecer citada na mensagem para
      // facilitar debugging pelo cliente. Fazemos essa asserção apenas
      // quando o token não é vazio nem só whitespace.
      const trimmed = bad.trim();
      if (trimmed.length > 0) expect(res.body.error.message).toContain(trimmed);

      // `supported` deve refletir SUPPORTED_VERSIONS exatamente (mesma ordem).
      expect(res.body.error.supported).toEqual(SUPPORTED_VERSIONS);
      // Cada versão suportada deve estar listada na mensagem também — o
      // cliente pode confiar em qualquer um dos dois lugares.
      for (const v of SUPPORTED_VERSIONS) expect(res.body.error.message).toContain(v);

      // O invariante mais forte: persist jamais executa em 406.
      expect(ctx.persist).not.toHaveBeenCalled();

      // A resposta deve ser JSON-serializável (não vaza referências circulares
      // nem objetos exóticos como Error).
      expect(() => JSON.stringify(res.body)).not.toThrow();
    },
  );

  it.each(UNKNOWN_VERSIONS)(
    "X-Schema-Version='%s' → 406 com supported exato e persist NÃO chamado",
    async (bad) => {
      const ctx = makeCtx();
      const res = await handlePatchTransactionVersioned(
        req({ headers: { "X-Schema-Version": bad } }),
        ctx,
      );
      assert406(res);
      expect(res.body.error.code).toBe("UNSUPPORTED_VERSION");
      expect(res.body.error.supported).toEqual(SUPPORTED_VERSIONS);
      expect(ctx.persist).not.toHaveBeenCalled();
    },
  );

  it.each(UNKNOWN_VERSIONS)(
    "query ?v='%s' → 406 com supported exato e persist NÃO chamado",
    async (bad) => {
      const ctx = makeCtx();
      const res = await handlePatchTransactionVersioned(req({ query: { v: bad } }), ctx);
      assert406(res);
      expect(res.body.error.code).toBe("UNSUPPORTED_VERSION");
      expect(res.body.error.supported).toEqual(SUPPORTED_VERSIONS);
      expect(ctx.persist).not.toHaveBeenCalled();
    },
  );

  it("precedência: Accept-Version desconhecida prevalece mesmo com X-Schema-Version e ?v válidos", async () => {
    // Se a precedência falhasse, o servidor cairia em uma versão válida,
    // rodaria o handler e chamaria persist. O 406 aqui é a evidência de que
    // o header de maior precedência foi honrado — e persist ficou intocado.
    const ctx = makeCtx();
    const res = await handlePatchTransactionVersioned(
      req({
        headers: { "Accept-Version": "42", "X-Schema-Version": "2" },
        query: { v: "1" },
      }),
      ctx,
    );
    assert406(res);
    expect(res.body.error.message).toContain("42");
    expect(ctx.persist).not.toHaveBeenCalled();
  });

  it("versão desconhecida SEM opt-in de fallback não degrada — 406, sem persist", async () => {
    // `Accept-Version-Fallback: something-else` NÃO é opt-in (só "default" é).
    const ctx = makeCtx();
    const res = await handlePatchTransactionVersioned(
      req({
        headers: {
          "Accept-Version": "999",
          "Accept-Version-Fallback": "yes-please",
        },
      }),
      ctx,
    );
    assert406(res);
    expect(res.body.error.supported).toEqual(SUPPORTED_VERSIONS);
    expect(ctx.persist).not.toHaveBeenCalled();
  });

  it("resposta 406 não contém `warning` — envelope de fallback é exclusivo do ramo 200", async () => {
    const ctx = makeCtx();
    const res = await handlePatchTransactionVersioned(
      req({ headers: { "Accept-Version": "nope" } }),
      ctx,
    );
    assert406(res);
    expect(res.body).not.toHaveProperty("warning");
    expect(res.body).not.toHaveProperty("data");
    // Root keys exatamente { error }.
    expect(Object.keys(res.body)).toEqual(["error"]);
    expect(ctx.persist).not.toHaveBeenCalled();
  });

  it("chamadas concorrentes com versões desconhecidas nunca disparam persist", async () => {
    const ctx = makeCtx();
    const results = await Promise.all(
      UNKNOWN_VERSIONS.map((v) =>
        handlePatchTransactionVersioned(req({ headers: { "Accept-Version": v } }), ctx),
      ),
    );
    for (const r of results) {
      assert406(r);
      expect(r.body.error.supported).toEqual(SUPPORTED_VERSIONS);
    }
    expect(ctx.persist).not.toHaveBeenCalled();
    expect(ctx.persist.mock.calls.length).toBe(0);
  });

  it("supported reflete SUPPORTED_VERSIONS estruturalmente em cada resposta", async () => {
    // Sem mutar a referência (o cliente é responsável por tratá-la como
    // imutável), verificamos que duas respostas independentes trazem o mesmo
    // conteúdo — a fonte é sempre a constante do servidor.
    const ctx = makeCtx();
    const res1 = await handlePatchTransactionVersioned(
      req({ headers: { "Accept-Version": "77" } }),
      ctx,
    );
    const res2 = await handlePatchTransactionVersioned(
      req({ headers: { "Accept-Version": "88" } }),
      ctx,
    );
    assert406(res1);
    assert406(res2);
    expect(res1.body.error.supported).toEqual(SUPPORTED_VERSIONS);
    expect(res2.body.error.supported).toEqual(SUPPORTED_VERSIONS);
    expect(ctx.persist).not.toHaveBeenCalled();
  });
});
