/**
 * Mapper: converte o output de um Zod parse (com `.passthrough()`, portanto
 * `[key: string]: unknown`) para as estruturas estritamente tipadas usadas
 * pelas asserções de drift/regras R1..R6.
 *
 * Não fazemos casts amplos (TS2352). Cada campo é validado individualmente e
 * mapeado para o tipo exato de `InstallmentPreview`.
 */
import type { InstallmentPreview } from "@/lib/patch-transaction-contract";

export type RawInstallmentRow = {
  installment_number?: number;
  total_installments?: number;
  amount?: number;
  installment_source_amount?: number;
  installment_mode?: "divide" | "fixed";
  [k: string]: unknown;
};

export type RawDriftFields = {
  sum?: number;
  source?: number;
  delta?: number;
  tolerance?: number;
  ok?: boolean;
  [k: string]: unknown;
};

export type RawDriftBody = {
  data?: {
    installments?: ReadonlyArray<RawInstallmentRow>;
    drift?: RawDriftFields;
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

export type DriftMetric = {
  sum: number;
  source: number;
  delta: number;
  tolerance: number;
  ok: boolean;
};

export interface DriftAssertInput {
  data: {
    installments: InstallmentPreview[];
    drift?: DriftMetric;
  };
}

const INSTALLMENT_FIELDS: Array<keyof RawInstallmentRow> = [
  "installment_number",
  "total_installments",
  "amount",
  "installment_source_amount",
  "installment_mode",
];

const DRIFT_FIELDS: Array<keyof RawDriftFields> = [
  "sum",
  "source",
  "delta",
  "tolerance",
  "ok",
];

export function narrowInstallment(row: RawInstallmentRow, i: number): InstallmentPreview {
  for (const key of INSTALLMENT_FIELDS) {
    if (row[key] === undefined) {
      throw new Error(`installments[${i}].${key} ausente no payload parseado`);
    }
  }
  return {
    installment_number: row.installment_number as number,
    total_installments: row.total_installments as number,
    amount: row.amount as number,
    installment_source_amount: row.installment_source_amount as number,
    installment_mode: row.installment_mode as "divide" | "fixed",
  };
}

export function narrowDrift(raw: RawDriftFields | undefined): DriftMetric | undefined {
  if (!raw) return undefined;
  for (const key of DRIFT_FIELDS) {
    if (raw[key] === undefined) return undefined;
  }
  return {
    sum: raw.sum as number,
    source: raw.source as number,
    delta: raw.delta as number,
    tolerance: raw.tolerance as number,
    ok: raw.ok as boolean,
  };
}

/** Adapta `{data:{installments, drift?}}` (Zod-parsed com passthrough) para
 *  a entrada estritamente tipada de `assertDriftRules`. */
export function toDriftInput(body: RawDriftBody): DriftAssertInput {
  const rows = body.data?.installments ?? [];
  return {
    data: {
      installments: rows.map((r, i) => narrowInstallment(r, i)),
      drift: narrowDrift(body.data?.drift),
    },
  };
}
