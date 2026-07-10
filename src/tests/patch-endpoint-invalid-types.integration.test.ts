/**
 * Integração — PATCH /transactions/:id com tipos inválidos
 *
 * Cobre o contrato HTTP do endpoint:
 *   - status codes corretos para cada classe de erro
 *   - formato de erro consistente: { error: { code, message, details? } }
 *   - saneamento silencioso de chaves fora do allowlist (nunca 422)
 *   - cálculo das parcelas nunca é executado quando a validação falha
 *   - quando o patch é válido, as parcelas regeneradas mantêm drift ≤ N¢
 */
import { describe, it, expect, vi } from "vitest";
import {
  handlePatchTransaction,
  type PatchPayload,
  type PatchResponse,
} from "@/lib/patch-transaction-handler";
import { calculateInstallmentDetails } from "@/lib/installment-utils";
import { validateGroupCoherence, type InstallmentGroupRow } from "@/lib/installment-edit";

const round2 = (n: number) => Math.round(n * 100) / 100;
const CENT = 0.01;

type ErrorResp = Extract<PatchResponse, { status: 400 | 404 | 405 | 415 | 422 }>;

function req(overrides: Partial<Parameters<typeof handlePatchTransaction>[0]> = {}) {
  return {
    method: "PATCH",
    id: "tx-1",
    contentType: "application/json",
    rawBody: "{}",
    ...overrides,
  };
}

function makePersist() {
  const spy = vi.fn(async (id: string, patch: PatchPayload) => ({ id, ...patch }));
  return spy;
}

function assertErrorShape(resp: PatchResponse): asserts resp is ErrorResp {
  expect(resp.status).not.toBe(200);
  const body = resp.body as ErrorResp["body"];
  expect(body).toHaveProperty("error");
  expect(typeof body.error.code).toBe("string");
  expect(typeof body.error.message).toBe("string");
  expect(body.error.message.length).toBeGreaterThan(0);
  if (body.error.details !== undefined) {
    expect(Array.isArray(body.error.details)).toBe(true);
    for (const d of body.error.details) {
      expect(typeof d.path).toBe("string");
      expect(typeof d.message).toBe("string");
    }
  }
}

describe("PATCH handler — status HTTP e formato de erro consistente", () => {
  it("405 quando o método não é PATCH", async () => {
    const persist = makePersist();
    const resp = await handlePatchTransaction(req({ method: "POST" }), { persist });
    expect(resp.status).toBe(405);
    assertErrorShape(resp);
    expect(resp.body.error.code).toBe("METHOD_NOT_ALLOWED");
    expect(persist).not.toHaveBeenCalled();
  });

  it("400 quando o id está ausente ou vazio", async () => {
    const persist = makePersist();
    const resp = await handlePatchTransaction(req({ id: "  " }), { persist });
    expect(resp.status).toBe(400);
    assertErrorShape(resp);
    expect(resp.body.error.code).toBe("MISSING_ID");
    expect(persist).not.toHaveBeenCalled();
  });

  it("415 quando o Content-Type não é application/json", async () => {
    const persist = makePersist();
    const resp = await handlePatchTransaction(
      req({ contentType: "text/plain", rawBody: "{}" }),
      { persist },
    );
    expect(resp.status).toBe(415);
    assertErrorShape(resp);
    expect(resp.body.error.code).toBe("INVALID_CONTENT_TYPE");
    expect(persist).not.toHaveBeenCalled();
  });

  it("400 quando o body não é JSON válido", async () => {
    const persist = makePersist();
    const resp = await handlePatchTransaction(req({ rawBody: "{not json" }), { persist });
    expect(resp.status).toBe(400);
    assertErrorShape(resp);
    expect(resp.body.error.code).toBe("INVALID_JSON");
    expect(persist).not.toHaveBeenCalled();
  });

  it("422 quando o body é um JSON válido mas não é objeto (array/null/primitivo)", async () => {
    const persist = makePersist();
    for (const raw of ["[]", "null", '"foo"', "42", "true"]) {
      const resp = await handlePatchTransaction(req({ rawBody: raw }), { persist });
      expect(resp.status).toBe(422);
      assertErrorShape(resp);
      expect(resp.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect(persist).not.toHaveBeenCalled();
  });

  it("422 EMPTY_PAYLOAD quando só chegam chaves fora do allowlist", async () => {
    const persist = makePersist();
    const resp = await handlePatchTransaction(
      req({ rawBody: JSON.stringify({ id: "x", user_id: "y", role: "admin" }) }),
      { persist },
    );
    expect(resp.status).toBe(422);
    assertErrorShape(resp);
    expect(resp.body.error.code).toBe("EMPTY_PAYLOAD");
    expect(persist).not.toHaveBeenCalled();
  });

  it("422 quando amount tem tipo inválido (string, boolean, NaN, Infinity, negativo, zero)", async () => {
    const persist = makePersist();
    const cases: unknown[] = ["100", true, Number.NaN, Number.POSITIVE_INFINITY, -1, 0];
    for (const amount of cases) {
      const resp = await handlePatchTransaction(
        req({ rawBody: JSON.stringify({ amount }) }),
        { persist },
      );
      expect(resp.status, `amount=${String(amount)}`).toBe(422);
      assertErrorShape(resp);
      expect(resp.body.error.code).toBe("VALIDATION_ERROR");
      expect(resp.body.error.details?.some((d) => d.path === "amount")).toBe(true);
    }
    expect(persist).not.toHaveBeenCalled();
  });

  it("422 quando total_installments tem tipo/valor inválido", async () => {
    const persist = makePersist();
    const cases: unknown[] = ["12", 1.5, 0, -3, 361, Number.NaN, null];
    for (const total_installments of cases) {
      const resp = await handlePatchTransaction(
        req({ rawBody: JSON.stringify({ total_installments }) }),
        { persist },
      );
      expect(resp.status, `total_installments=${String(total_installments)}`).toBe(422);
      assertErrorShape(resp);
      expect(resp.body.error.details?.some((d) => d.path === "total_installments")).toBe(true);
    }
    expect(persist).not.toHaveBeenCalled();
  });

  it("422 quando name tem tipo inválido (número, boolean, string vazia)", async () => {
    const persist = makePersist();
    for (const name of [123, true, "", "   "]) {
      const resp = await handlePatchTransaction(
        req({ rawBody: JSON.stringify({ name }) }),
        { persist },
      );
      expect(resp.status).toBe(422);
      assertErrorShape(resp);
      expect(resp.body.error.details?.some((d) => d.path === "name")).toBe(true);
    }
    expect(persist).not.toHaveBeenCalled();
  });

  it("422 quando category/icon/card/bank_account_id têm tipos inválidos (number/bool/obj)", async () => {
    const persist = makePersist();
    for (const field of ["category", "icon", "card", "bank_account_id"] as const) {
      for (const value of [123, true, { a: 1 }, []]) {
        const resp = await handlePatchTransaction(
          req({ rawBody: JSON.stringify({ [field]: value }) }),
          { persist },
        );
        expect(resp.status, `${field}=${JSON.stringify(value)}`).toBe(422);
        assertErrorShape(resp);
        expect(resp.body.error.details?.some((d) => d.path === field)).toBe(true);
      }
    }
    expect(persist).not.toHaveBeenCalled();
  });

  it("422 lista TODOS os campos inválidos em details (não para no primeiro)", async () => {
    const persist = makePersist();
    const resp = await handlePatchTransaction(
      req({
        rawBody: JSON.stringify({
          name: "",
          amount: -5,
          total_installments: "abc",
          category: 42,
        }),
      }),
      { persist },
    );
    expect(resp.status).toBe(422);
    assertErrorShape(resp);
    const paths = new Set(resp.body.error.details?.map((d) => d.path) ?? []);
    expect(paths.has("name")).toBe(true);
    expect(paths.has("amount")).toBe(true);
    expect(paths.has("total_installments")).toBe(true);
    expect(paths.has("category")).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it("chaves fora do allowlist são silenciosamente descartadas (não geram 422)", async () => {
    const persist = makePersist();
    const resp = await handlePatchTransaction(
      req({
        rawBody: JSON.stringify({
          category: "Alimentação",
          id: "atacante",
          user_id: "outro",
          is_admin: true,
          __proto__: { polluted: true },
        }),
      }),
      { persist },
    );
    expect(resp.status).toBe(200);
    expect(persist).toHaveBeenCalledTimes(1);
    const [, patch] = persist.mock.calls[0];
    expect(Object.keys(patch)).toEqual(["category"]);
    expect((patch as Record<string, unknown>).id).toBeUndefined();
    expect((patch as Record<string, unknown>).is_admin).toBeUndefined();
  });

  it("200 e persiste apenas campos saneados quando o payload é válido", async () => {
    const persist = makePersist();
    const resp = await handlePatchTransaction(
      req({
        rawBody: JSON.stringify({
          name: "  Compra  ",
          amount: 33.333, // arredonda para 33.33
          total_installments: 3,
          category: "Casa",
          icon: "🏠",
          bank_account_id: null,
        }),
      }),
      { persist },
    );
    expect(resp.status).toBe(200);
    expect(persist).toHaveBeenCalledTimes(1);
    const [id, patch] = persist.mock.calls[0];
    expect(id).toBe("tx-1");
    expect(patch).toEqual({
      name: "Compra",
      amount: 33.33,
      total_installments: 3,
      category: "Casa",
      icon: "🏠",
      bank_account_id: null,
    });
  });

  it("404 quando o persist devolve null (id inexistente)", async () => {
    const persist = vi.fn(async () => null);
    const resp = await handlePatchTransaction(
      req({ rawBody: JSON.stringify({ category: "X" }) }),
      { persist },
    );
    expect(resp.status).toBe(404);
    assertErrorShape(resp);
    expect(resp.body.error.code).toBe("NOT_FOUND");
  });

  it("nenhum cálculo de parcela é executado quando a validação falha", async () => {
    const persist = vi.fn(async () => {
      // Se chegar aqui, calcularíamos parcelas — o teste garante que NÃO chega.
      throw new Error("persist não deve ser chamado em payload inválido");
    });
    const resp = await handlePatchTransaction(
      req({
        rawBody: JSON.stringify({
          amount: "não é número",
          total_installments: "doze",
        }),
      }),
      { persist },
    );
    expect(resp.status).toBe(422);
    expect(persist).not.toHaveBeenCalled();
  });

  it("quando o patch é válido, parcelas regeneradas mantêm drift ≤ N¢", async () => {
    const persist = makePersist();
    const resp = await handlePatchTransaction(
      req({
        rawBody: JSON.stringify({
          amount: round2(100 / 3), // 33.33 (dízima)
          total_installments: 3,
        }),
      }),
      { persist },
    );
    expect(resp.status).toBe(200);
    const [, patch] = persist.mock.calls[0];
    const p = patch as PatchPayload;
    const n = p.total_installments as number;
    const source = round2((p.amount as number) * n); // 99.99
    const { valorParcela } = calculateInstallmentDetails(source, n, "divide");
    const rows: InstallmentGroupRow[] = Array.from({ length: n }, (_, i) => ({
      installment_group_id: "grp-patch",
      installment_number: i + 1,
      total_installments: n,
      amount: valorParcela,
      installment_source_amount: source,
      installment_mode: "divide",
      category: null,
      icon: null,
      card: null,
      bank_account_id: null,
    }));
    const sum = rows.reduce((s, r) => s + r.amount, 0);
    expect(Math.abs(sum - source)).toBeLessThanOrEqual(n * CENT + 1e-9);
    expect(validateGroupCoherence(rows).ok).toBe(true);
  });
});
