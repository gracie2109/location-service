/** Error codes of the public contract (openapi.yaml, schema Problem). */
export type ProblemCode =
  | "invalid_parameter"
  | "not_found"
  | "cursor_stale"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "catalog_unavailable"
  | "internal";

export type Problem = {
  type: string;
  title: string;
  status: number;
  code: ProblemCode;
  detail?: string;
  instance?: string;
  errors?: { parameter: string; message: string }[];
};

const BY_STATUS: Record<number, { code: ProblemCode; title: string }> = {
  400: { code: "invalid_parameter", title: "Invalid parameter" },
  401: { code: "unauthorized", title: "Unauthorized" },
  403: { code: "forbidden", title: "Forbidden" },
  404: { code: "not_found", title: "Not found" },
  409: { code: "cursor_stale", title: "Cursor is stale" },
  429: { code: "rate_limited", title: "Too many requests" },
  503: { code: "catalog_unavailable", title: "Catalog unavailable" },
};

/** Builds the RFC 9457 body for an HTTP status; unknown statuses become `internal`. */
export const problemForStatus = (status: number, instance?: string, detail?: string): Problem => {
  const known = BY_STATUS[status];
  return {
    type: "about:blank",
    title: known?.title ?? "Internal error",
    status: known ? status : 500,
    code: known?.code ?? "internal",
    ...(detail ? { detail } : {}),
    ...(instance ? { instance } : {}),
  };
};
