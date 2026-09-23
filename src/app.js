import express from "express";
import { createLeadsRouter } from "./routes/leadsRoutes.js";
import { requestContextMiddleware } from "./observability/requestContext.js";
import { logger as defaultLogger, safeErrorName } from "./observability/logger.js";
import { createHttpLoggingMiddleware } from "./observability/httpLogging.js";

const requiredClientConfig = [
  "clientId",
  "clientSecret",
  "refreshToken",
  "accountsUrl",
  "apiDomain",
  "customSourceField",
];

function hasClientConfiguration(crmClient) {
  return requiredClientConfig.every((key) => {
    const value = crmClient?.config?.[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

export function createApp({ crmClient, logger = defaultLogger } = {}) {
  const app = express();

  app.disable("x-powered-by");

  app.use(requestContextMiddleware);
  app.use(createHttpLoggingMiddleware(logger));

  app.use(
    express.json({
      limit: "100kb",
    }),
  );

  app.get("/health", (request, response) => {
    response.status(200).json({
      status: "ok",
      service: "zoho-crm-api-study",
    });
  });

  app.get("/readiness", (request, response) => {
    const ready = hasClientConfiguration(crmClient);

    response.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "not_ready",
      service: "zoho-crm-api-study",
      checks: {
        zoho_configuration: ready ? "ok" : "not_configured",
      },
    });
  });

  if (crmClient) {
    app.use("/api/leads", createLeadsRouter(crmClient));
  }

  app.use((request, response) => {
    response.status(404).json({
      success: false,
      error: {
        code: "ROUTE_NOT_FOUND",
        message: "Rota não encontrada.",
      },
    });
  });

  app.use((error, request, response, next) => {
    if (error instanceof SyntaxError && error.type === "entity.parse.failed") {
      response.status(400).json({
        success: false,
        error: {
          code: "INVALID_JSON",
          message: "O corpo da requisição contém JSON inválido.",
        },
      });

      return;
    }

    if (error?.name === "ZohoApiError") {
      const upstreamCode = getZohoPublicErrorCode(error.status);
      response.status(502).json({
        success: false,
        error: {
          code: upstreamCode,
          message: getZohoPublicErrorMessage(upstreamCode),
        },
      });

      return;
    }

    if (
      Number.isInteger(error?.statusCode)
      && error.statusCode >= 400
      && error.statusCode < 500
    ) {
      response.status(error.statusCode).json({
        success: false,
        error: {
          code: error.code ?? "REQUEST_ERROR",
          message: error.message,
        },
      });

      return;
    }

    if (error instanceof TypeError) {
      response.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: error.message,
        },
      });

      return;
    }

    response.locals.unhandledErrorName = safeErrorName(error);
    response.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Ocorreu um erro interno.",
      },
    });
  });

  return app;
}

function getZohoPublicErrorCode(status) {
  if (status === 401 || status === 403) {
    return "ZOHO_AUTH_ERROR";
  }

  if (status === 429) {
    return "ZOHO_RATE_LIMITED";
  }

  return "ZOHO_API_ERROR";
}

function getZohoPublicErrorMessage(code) {
  if (code === "ZOHO_AUTH_ERROR") {
    return "Não foi possível autenticar na Zoho.";
  }

  if (code === "ZOHO_RATE_LIMITED") {
    return "A Zoho limitou a requisição. Tente novamente mais tarde.";
  }

  return "Não foi possível concluir a operação na Zoho.";
}
