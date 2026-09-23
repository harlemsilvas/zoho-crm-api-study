import express from "express";
import { createLeadsRouter } from "./routes/leadsRoutes.js";
import { requestContextMiddleware } from "./observability/requestContext.js";
import { logger as defaultLogger, safeErrorName } from "./observability/logger.js";
import { createHttpLoggingMiddleware } from "./observability/httpLogging.js";

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
