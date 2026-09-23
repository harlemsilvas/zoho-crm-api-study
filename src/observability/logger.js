import { getRequestId } from "./requestContext.js";

const sensitiveKeys = new Set([
  "authorization", "cookie", "setcookie", "accesstoken", "refreshtoken",
  "clientsecret", "clientid", "password", "secret", "token", "xwebhookkey",
  "headers", "body", "payload", "firstname", "lastname", "name", "company",
  "email", "description",
]);
const errorNames = new Set([
  "Error", "TypeError", "SyntaxError", "RangeError", "ReferenceError",
  "URIError", "EvalError", "AggregateError", "AbortError", "ZohoApiError",
]);

export function safeErrorName(error) {
  return errorNames.has(error?.name) ? error.name : "Error";
}

function sanitize(value, ancestors = new WeakSet(), depth = 0) {
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (value === null || typeof value !== "object") {
    return typeof value === "bigint" ? String(value) : value;
  }
  // Error messages, stacks, causes and custom properties may contain credentials.
  if (value instanceof Error) return { error_name: safeErrorName(value) };
  if (ancestors.has(value)) return "[Circular]";
  if (depth >= 32) return "[Truncated]";
  ancestors.add(value);
  const result = Array.isArray(value) ? [] : Object.create(null);
  for (const key of Object.keys(value)) {
    const normalizedKey = key.toLowerCase().replace(/[-_]/g, "");
    result[key] = sensitiveKeys.has(normalizedKey)
      ? "[REDACTED]"
      : sanitize(value[key], ancestors, depth + 1);
  }
  ancestors.delete(value);
  return result;
}

export function createLogger({ write = (line) => process.stdout.write(line) } = {}) {
  function log(level, event, metadata) {
    try {
      const sanitized = sanitize(metadata);
      const fields = sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
        ? sanitized
        : { metadata: sanitized };
      const record = {
        ...fields,
        timestamp: new Date().toISOString(),
        level,
        event,
        request_id: getRequestId(),
      };
      write(`${JSON.stringify(record)}\n`);
    } catch {
      // Observability must not change the outcome of a CRM operation.
      // Never fall back to printing the original, potentially sensitive object.
    }
  }

  return {
    info: (event, metadata) => log("info", event, metadata),
    warn: (event, metadata) => log("warn", event, metadata),
    error: (event, metadata) => log("error", event, metadata),
  };
}

export const logger = createLogger();
