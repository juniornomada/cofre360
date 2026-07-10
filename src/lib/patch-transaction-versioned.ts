// Version negotiation layer for the PATCH transaction endpoint.
//
// A client selects the response schema version via either:
//   - HTTP header `Accept-Version: 1 | 2 | 3`
//   - HTTP header `X-Schema-Version: 1 | 2 | 3` (alias)
//   - Query string `?v=1|2|3` (fallback for callers that can't set headers)
//
// Precedence when more than one is provided: `Accept-Version` > `X-Schema-Version` > `?v=`.
// When none is provided, the server responds with the DEFAULT_VERSION (latest stable).
//
// Version shapes:
//   V1 — legacy: { data: { id, installments[] } }
//   V2 — current: V1 + { normalized, drift }
//   V3 — forward-compat: V2 + { schema_version: "3" }
//
// Unknown versions produce 406 Not Acceptable with the list of supported versions.
//
// Drift invariants (R5) are enforced across every version, since they encode
// a regulatory guarantee — not a presentational detail. R6 (drift metric
// object) is present only in V2+.
import {
  handlePatchTransactionContract,
  type PatchContractContext,
  type PatchContractResponse,
  type PatchContractSuccessBody,
  type InstallmentPreview,
} from "./patch-transaction-contract";
import type { PatchRequest } from "./patch-transaction-handler";

export const SUPPORTED_VERSIONS = ["1", "2", "3"] as const;
export type SchemaVersion = (typeof SUPPORTED_VERSIONS)[number];
export const DEFAULT_VERSION: SchemaVersion = "2";

export interface VersionedRequest extends PatchRequest {
  headers?: Record<string, string | undefined>;
  query?: Record<string, string | undefined>;
}

/** Envelope de aviso emitido quando o cliente opta pelo fallback seguro
 *  e a versão pedida não existe. Nunca aparece em respostas de versão suportada. */
export interface VersionFallbackWarning {
  code: "VERSION_FALLBACK";
  requested: string;
  served: SchemaVersion;
  supported: readonly SchemaVersion[];
}

export interface VersionedSuccessV1 {
  schema_version: "1";
  data: {
    id: string;
    installments: InstallmentPreview[];
  };
  warning?: VersionFallbackWarning;
}
export interface VersionedSuccessV2 {
  schema_version: "2";
  data: PatchContractSuccessBody["data"];
  warning?: VersionFallbackWarning;
}
export interface VersionedSuccessV3 {
  schema_version: "3";
  data: PatchContractSuccessBody["data"] & { schema_version: "3" };
  warning?: VersionFallbackWarning;
}

export type VersionedResponse =
  | { status: 200; version: "1"; body: VersionedSuccessV1 }
  | { status: 200; version: "2"; body: VersionedSuccessV2 }
  | { status: 200; version: "3"; body: VersionedSuccessV3 }
  | {
      status: 406;
      body: {
        error: {
          code: "UNSUPPORTED_VERSION";
          message: string;
          supported: readonly SchemaVersion[];
        };
      };
    }
  | Exclude<PatchContractResponse, { status: 200 }>;


/** Extract the requested version and its source, honoring precedence. */
export function negotiateVersion(req: VersionedRequest): {
  version: string;
  source: "header:accept-version" | "header:x-schema-version" | "query:v" | "default";
} {
  const h = req.headers ?? {};
  // Header lookup is case-insensitive at the HTTP layer, but this helper
  // accepts arbitrary keys — normalize before matching.
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) if (v != null) lower[k.toLowerCase()] = v;
  if (lower["accept-version"]) {
    return { version: lower["accept-version"].trim(), source: "header:accept-version" };
  }
  if (lower["x-schema-version"]) {
    return { version: lower["x-schema-version"].trim(), source: "header:x-schema-version" };
  }
  const q = req.query?.v;
  if (q) return { version: q.trim(), source: "query:v" };
  return { version: DEFAULT_VERSION, source: "default" };
}

/** Type guard: is `v` one of the versions this build actually implements? */
function isSupported(v: string): v is SchemaVersion {
  return (SUPPORTED_VERSIONS as readonly string[]).includes(v);
}

export async function handlePatchTransactionVersioned(
  req: VersionedRequest,
  ctx: PatchContractContext,
): Promise<VersionedResponse> {
  const { version } = negotiateVersion(req);
  if (!isSupported(version)) {
    return {
      status: 406,
      body: {
        error: {
          code: "UNSUPPORTED_VERSION",
          message: `Schema version '${version}' not supported. Use one of: ${SUPPORTED_VERSIONS.join(", ")}.`,
          supported: SUPPORTED_VERSIONS,
        },
      },
    };
  }

  const base = await handlePatchTransactionContract(req, ctx);
  if (base.status !== 200) return base;

  const v2Data = base.body.data;
  switch (version) {
    case "1":
      return {
        status: 200,
        version: "1",
        body: {
          schema_version: "1",
          data: { id: v2Data.id, installments: v2Data.installments },
        },
      };
    case "2":
      return {
        status: 200,
        version: "2",
        body: { schema_version: "2", data: v2Data },
      };
    case "3":
      return {
        status: 200,
        version: "3",
        body: {
          schema_version: "3",
          data: { ...v2Data, schema_version: "3" },
        },
      };
  }
}
