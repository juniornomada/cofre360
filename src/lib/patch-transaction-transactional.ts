// Transactional wrapper for the PATCH transaction endpoint.
//
// Invariants garantidos:
//   1) Se o payload é INVÁLIDO (schema, content-type, JSON, id, allowlist),
//      NADA é persistido — nem o registro-pai, nem QUALQUER parcela.
//   2) Escritas do registro-pai e das parcelas ocorrem dentro de uma única
//      unidade lógica (`runInTransaction`). Qualquer erro/reject faz
//      rollback: nenhuma escrita é confirmada.
//   3) Uma verificação pós-cálculo de drift (|Σparcelas − source| ≤ N¢)
//      também dispara rollback — impedimos que um cálculo malformado
//      corrompa o grupo mesmo se o schema passar.
//
// A implementação é framework-free: recebe um `runInTransaction` do caller
// (Supabase RPC, driver Postgres, mock in-memory) para poder ser unit-testada.
import {
  handlePatchTransaction,
  type PatchPayload,
  type PatchRequest,
  type PatchResponse,
} from "./patch-transaction-handler";
import { calculateInstallmentDetails } from "./installment-utils";

const CENT = 0.01;
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface TxInstallmentRow {
  installment_number: number;
  total_installments: number;
  amount: number;
  installment_source_amount: number;
  installment_mode: "divide" | "fixed";
}

export interface TxCurrentRow {
  amount: number;
  total_installments: number;
  installment_mode?: "divide" | "fixed";
  installment_source_amount?: number;
}

/** Operações disponíveis dentro da transação. */
export interface TxOps {
  persistParent: (id: string, patch: PatchPayload) => Promise<Record<string, unknown> | null>;
  replaceInstallments: (id: string, rows: TxInstallmentRow[]) => Promise<void>;
}

export interface PatchTxContext {
  currentRow: TxCurrentRow | null;
  /**
   * Executa `work` dentro de uma transação. Se `work` lançar ou retornar
   * uma Promise rejeitada, o caller DEVE reverter TODAS as escritas feitas
   * via `ops` e re-lançar o erro. A implementação real chama BEGIN/COMMIT/
   * ROLLBACK no banco; em testes, um mock rastreia writes e descarta em erro.
   */
  runInTransaction: <T>(work: (ops: TxOps) => Promise<T>) => Promise<T>;
}

export interface PatchTxSuccessBody {
  data: {
    id: string;
    normalized: PatchPayload;
    installments: TxInstallmentRow[];
    drift: { sum: number; source: number; delta: number; tolerance: number; ok: boolean };
    committed: true;
  };
}

export type PatchTxResponse =
  | { status: 200; body: PatchTxSuccessBody }
  | Extract<PatchResponse, { status: 400 | 404 | 405 | 415 | 422 }>
  | {
      status: 409;
      body: {
        error: {
          code: "DRIFT_EXCEEDED";
          message: string;
          details?: Array<{ path: string; message: string }>;
        };
      };
    };

export async function handlePatchTransactionTransactional(
  req: PatchRequest,
  ctx: PatchTxContext,
): Promise<PatchTxResponse> {
  // -------- Fase 1: validação PURA (sem side effects). --------
  // Reutilizamos o handler existente, mas com um `persist` que NÃO grava —
  // apenas captura o patch saneado. Se qualquer coisa falhar aqui, o handler
  // devolve 4xx e retornamos ANTES de abrir a transação. Zero writes.
  let captured: { id: string; patch: PatchPayload } | null = null;
  const validation = await handlePatchTransaction(req, {
    persist: async (id, patch) => {
      captured = { id, patch };
      // Retornamos um objeto sinal — nunca é persistido. A gravação real
      // acontece dentro do runInTransaction abaixo.
      return { __validated: true };
    },
  });

  if (validation.status !== 200 || !captured) {
    return validation as PatchTxResponse;
  }

  const { id, patch } = captured as { id: string; patch: PatchPayload };

  // -------- Fase 2: cálculo determinístico das parcelas. --------
  const current = ctx.currentRow;
  const mode: "divide" | "fixed" = current?.installment_mode ?? "divide";
  const nextAmount =
    patch.amount !== undefined ? patch.amount : current?.amount ?? 0;
  const nextN =
    patch.total_installments !== undefined
      ? patch.total_installments
      : current?.total_installments ?? 1;
  const source =
    patch.amount !== undefined
      ? round2(nextAmount * nextN)
      : current?.installment_source_amount ??
        round2((current?.amount ?? 0) * (current?.total_installments ?? 1));

  const { valorParcela } = calculateInstallmentDetails(source, nextN, mode, nextAmount);
  const installments: TxInstallmentRow[] = Array.from({ length: nextN }, (_, i) => ({
    installment_number: i + 1,
    total_installments: nextN,
    amount: valorParcela,
    installment_source_amount: source,
    installment_mode: mode,
  }));

  const sum = round2(installments.reduce((s, r) => s + r.amount, 0));
  const delta = round2(Math.abs(sum - source));
  const tolerance = round2(nextN * CENT);
  const ok = delta <= tolerance + 1e-9;

  // -------- Fase 3: escrita atômica ou rollback total. --------
  // Se o cálculo violar o drift regulamentar, NÃO abrimos a transação —
  // não escrevemos nem o registro-pai.
  if (!ok) {
    return {
      status: 409,
      body: {
        error: {
          code: "DRIFT_EXCEEDED",
          message: `Drift exceeds tolerance: |Σ − source|=${delta} > ${tolerance} (N=${nextN}¢).`,
          details: [
            { path: "installments", message: `sum=${sum}, source=${source}` },
          ],
        },
      },
    };
  }

  let parentRow: Record<string, unknown> | null = null;
  try {
    parentRow = await ctx.runInTransaction(async (ops) => {
      const persisted = await ops.persistParent(id, patch);
      if (!persisted) {
        // Sinaliza NOT_FOUND para rollback: nenhuma parcela deve ser escrita.
        throw new NotFoundError(id);
      }
      await ops.replaceInstallments(id, installments);
      return persisted;
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return {
        status: 404,
        body: {
          error: { code: "NOT_FOUND", message: `Transaction ${err.id} not found.` },
        },
      };
    }
    // Qualquer outro erro é tratado pelo runInTransaction (rollback) e
    // propagado para cima — mantemos a semântica de "sem persistência
    // parcial" ao rejeitar a Promise.
    throw err;
  }

  return {
    status: 200,
    body: {
      data: {
        id,
        normalized: patch,
        installments,
        drift: { sum, source, delta, tolerance, ok: true },
        committed: true,
      },
    },
  };
}

class NotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Transaction ${id} not found`);
  }
}
