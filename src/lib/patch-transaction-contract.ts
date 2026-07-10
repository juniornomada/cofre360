// Contract wrapper for the PATCH transaction endpoint.
// Ensures the success response ALWAYS carries:
//   1) the normalized payload (post-sanitization / post-validation)
//   2) the recalculated installments derived from that payload
//   3) a drift metric proving |Σparcelas − source| ≤ N × 1¢
import {
  handlePatchTransaction,
  type PatchPayload,
  type PatchRequest,
  type PatchResponse,
} from "./patch-transaction-handler";
import { calculateInstallmentDetails } from "./installment-utils";

const CENT = 0.01;
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface InstallmentPreview {
  installment_number: number;
  total_installments: number;
  amount: number;
  installment_source_amount: number;
  installment_mode: "divide" | "fixed";
}

export interface PatchContractSuccessBody {
  data: {
    id: string;
    normalized: PatchPayload;
    installments: InstallmentPreview[];
    drift: { sum: number; source: number; delta: number; tolerance: number; ok: boolean };
  };
}

export type PatchContractResponse =
  | { status: 200; body: PatchContractSuccessBody }
  | Extract<PatchResponse, { status: 400 | 404 | 405 | 415 | 422 }>;

export interface PatchContractContext {
  // Current persisted state of the row, so partial patches can be merged
  // before recomputing installments.
  currentRow: {
    amount: number;
    total_installments: number;
    installment_mode?: "divide" | "fixed";
    installment_source_amount?: number;
  } | null;
  persist: (id: string, patch: PatchPayload) => Promise<Record<string, unknown> | null>;
}

export async function handlePatchTransactionContract(
  req: PatchRequest,
  ctx: PatchContractContext,
): Promise<PatchContractResponse> {
  let captured: { id: string; patch: PatchPayload } | null = null;

  const inner = await handlePatchTransaction(req, {
    persist: async (id, patch) => {
      captured = { id, patch };
      return ctx.persist(id, patch);
    },
  });

  if (inner.status !== 200 || !captured) return inner;

  const { id, patch } = captured as { id: string; patch: PatchPayload };
  const current = ctx.currentRow;

  // Merge patch with the current row so partial PATCHes still yield a
  // consistent installments recalculation.
  const mode: "divide" | "fixed" = current?.installment_mode ?? "divide";
  const nextAmount =
    patch.amount !== undefined ? patch.amount : current?.amount ?? 0;
  const nextN =
    patch.total_installments !== undefined
      ? patch.total_installments
      : current?.total_installments ?? 1;

  // Source: if amount changed, derive from new amount × N. Otherwise keep
  // the row's economic source (or reconstruct from current amount × current N).
  const source =
    patch.amount !== undefined
      ? round2(nextAmount * nextN)
      : current?.installment_source_amount ??
        round2((current?.amount ?? 0) * (current?.total_installments ?? 1));

  const { valorParcela } = calculateInstallmentDetails(source, nextN, mode, nextAmount);
  const installments: InstallmentPreview[] = Array.from({ length: nextN }, (_, i) => ({
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

  return {
    status: 200,
    body: {
      data: {
        id,
        normalized: patch,
        installments,
        drift: { sum, source, delta, tolerance, ok },
      },
    },
  };
}
