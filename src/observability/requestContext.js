import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const requestContext = new AsyncLocalStorage();

export function getRequestId() {
  return requestContext.getStore()?.request_id;
}

export function requestContextMiddleware(request, response, next) {
  const requestId = normalizeRequestId(request.headers["x-request-id"]);

  response.setHeader("X-Request-ID", requestId);
  return requestContext.run({ request_id: requestId }, next);
}

function normalizeRequestId(value) {
  // Reject line breaks before trimming, including those at the edges.
  if (typeof value !== "string" || /[\r\n]/.test(value)) {
    return randomUUID();
  }

  const normalized = value.trim();

  if (!/^[A-Za-z0-9._-]{1,128}$/.test(normalized)) {
    return randomUUID();
  }

  return normalized;
}
