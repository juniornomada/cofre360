// Pure PATCH handler for transaction updates.
// Validates the incoming payload against a strict schema and returns a
// consistent HTTP-style response shape. Kept framework-free so it can be
// reused from a TanStack server route/function and unit-tested directly.
import { z } from "zod";

export type PatchResponse<T = unknown> =
  | { status: 200; body: { data: T } }
  | {
      status: 400 | 404 | 405 | 415 | 422;
      body: {
        error: {
          code:
            | "INVALID_JSON"
            | "INVALID_CONTENT_TYPE"
            | "METHOD_NOT_ALLOWED"
            | "VALIDATION_ERROR"
            | "MISSING_ID"
            | "NOT_FOUND"
            | "EMPTY_PAYLOAD";
          message: string;
          details?: Array<{ path: string; message: string; code?: string }>;
        };
      };
    };

// Allowlist of fields the client may PATCH. Anything outside is stripped
// silently before validation (mass-assignment defense) — never causes a 422.
const ALLOWED_KEYS = [
  "name",
  "amount",
  "total_installments",
  "date",
  "category",
  "icon",
  "card",
  "bank_account_id",
] as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

export const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    amount: z
      .number()
      .refine((n) => Number.isFinite(n), { message: "amount must be finite" })
      .positive()
      .transform(round2)
      .optional(),
    total_installments: z
      .number()
      .refine((n) => Number.isFinite(n), { message: "total_installments must be finite" })
      .int()
      .min(1)
      .max(360)
      .optional(),
    date: z.string().trim().min(1).max(32).optional(),
    category: z.union([z.string().max(120), z.null()]).optional(),
    icon: z.union([z.string().max(16), z.null()]).optional(),
    card: z.union([z.string().max(80), z.null()]).optional(),
    bank_account_id: z.union([z.string().max(80), z.null()]).optional(),
  })
  .strict();

export type PatchPayload = z.infer<typeof patchSchema>;

function stripToAllowlist(input: Record<string, unknown>): {
  clean: Record<string, unknown>;
  dropped: string[];
} {
  const allowed = new Set<string>(ALLOWED_KEYS);
  const clean: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const k of Object.keys(input)) {
    if (allowed.has(k)) clean[k] = input[k];
    else dropped.push(k);
  }
  return { clean, dropped };
}

export interface PatchRequest {
  method: string;
  id: string | undefined;
  contentType: string | null;
  rawBody: string;
}

export interface PatchHandlerOptions {
  // Called only after successful validation with sanitized payload.
  // Should return the persisted row, or null when the id was not found.
  persist: (id: string, patch: PatchPayload) => Promise<Record<string, unknown> | null>;
}

export async function handlePatchTransaction(
  req: PatchRequest,
  opts: PatchHandlerOptions,
): Promise<PatchResponse> {
  if (req.method.toUpperCase() !== "PATCH") {
    return {
      status: 405,
      body: {
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: `Method ${req.method} not allowed. Use PATCH.`,
        },
      },
    };
  }

  if (!req.id || typeof req.id !== "string" || req.id.trim().length === 0) {
    return {
      status: 400,
      body: {
        error: { code: "MISSING_ID", message: "Transaction id is required." },
      },
    };
  }

  const ct = (req.contentType || "").toLowerCase();
  if (!ct.includes("application/json")) {
    return {
      status: 415,
      body: {
        error: {
          code: "INVALID_CONTENT_TYPE",
          message: "Content-Type must be application/json.",
        },
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(req.rawBody);
  } catch {
    return {
      status: 400,
      body: {
        error: { code: "INVALID_JSON", message: "Request body is not valid JSON." },
      },
    };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      status: 422,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: "Payload must be a JSON object.",
          details: [{ path: "", message: "expected object", code: "invalid_type" }],
        },
      },
    };
  }

  const { clean } = stripToAllowlist(parsed as Record<string, unknown>);

  if (Object.keys(clean).length === 0) {
    return {
      status: 422,
      body: {
        error: {
          code: "EMPTY_PAYLOAD",
          message: "Payload must contain at least one updatable field.",
        },
      },
    };
  }

  const result = patchSchema.safeParse(clean);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
      code: i.code,
    }));
    return {
      status: 422,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: "One or more fields failed validation.",
          details,
        },
      },
    };
  }

  const row = await opts.persist(req.id, result.data);
  if (!row) {
    return {
      status: 404,
      body: { error: { code: "NOT_FOUND", message: `Transaction ${req.id} not found.` } },
    };
  }

  return { status: 200, body: { data: row } };
}
