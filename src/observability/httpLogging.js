import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

// Only known route templates are logged, never user-supplied path segments.
function safePath(path) {
  if (/^\/health\/?$/i.test(path)) return "/health";
  if (/^\/api\/leads\/?$/i.test(path)) return "/api/leads";
  if (/^\/api\/leads\/[^/]+\/?$/i.test(path)) return "/api/leads/:id";
  return "[unmatched]";
}

export function createHttpLoggingMiddleware(logger) {
  return (request, response, next) => {
    const started = performance.now();
    const path = safePath(request.path);
    const method = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(request.method)
      ? request.method : "OTHER";
    response.once("finish", AsyncLocalStorage.bind(() => {
      const fields = {
        method,
        path,
        status: response.statusCode,
        duration_ms: Math.round((performance.now() - started) * 1000) / 1000,
      };
      if (response.locals.unhandledErrorName) {
        logger.error("http_request_failed", {
          ...fields,
          error_name: response.locals.unhandledErrorName,
          code: "INTERNAL_ERROR",
        });
      }
      const level = response.statusCode >= 500 ? "error"
        : response.statusCode >= 400 ? "warn" : "info";
      logger[level]("http_request_completed", fields);
    }));
    next();
  };
}
