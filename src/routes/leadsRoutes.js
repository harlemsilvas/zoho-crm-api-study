import express from "express";

export function createLeadsRouter(crmClient) {
  if (!crmClient) {
    throw new TypeError("Uma instância de ZohoCrmClient é obrigatória.");
  }

  const router = express.Router();

  router.get("/", async (request, response, next) => {
    try {
      const perPage = parsePerPage(request.query.per_page);

      const result = await crmClient.listLeads({
        perPage,
      });

      response.status(200).json({
        success: true,
        data: result.data ?? [],
        info: result.info ?? null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (request, response, next) => {
    try {
      const result = await crmClient.createLead(request.body);

      const created = getSuccessfulOperation(
        result,
        "A criação do Lead não foi confirmada.",
      );

      response.status(201).json({
        success: true,
        data: {
          id: created.details?.id,
          code: created.code,
          message: created.message,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (request, response, next) => {
    try {
      const result = await crmClient.getLead(request.params.id);

      response.status(200).json({
        success: true,
        data: result.data?.[0] ?? null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id", async (request, response, next) => {
    try {
      const confirmUpdate = request.get("X-Confirm-Update") === "true";

      const result = await crmClient.updateLead(
        request.params.id,
        request.body,
        {
          confirm: confirmUpdate,
        },
      );

      const updated = getSuccessfulOperation(
        result,
        "A atualização do Lead não foi confirmada.",
      );

      response.status(200).json({
        success: true,
        data: {
          id: updated.details?.id,
          code: updated.code,
          message: updated.message,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function getSuccessfulOperation(result, errorMessage) {
  const operation = result.data?.[0];

  if (!operation || operation.status !== "success") {
    throw new Error(operation?.message ?? errorMessage);
  }

  return operation;
}

function parsePerPage(value) {
  if (value === undefined) {
    return 10;
  }

  const normalizedValue = String(value).trim();

  if (!/^\d+$/.test(normalizedValue)) {
    throw new TypeError("per_page deve ser um número inteiro.");
  }

  const perPage = Number(normalizedValue);

  if (perPage < 1 || perPage > 200) {
    throw new TypeError("per_page deve estar entre 1 e 200.");
  }

  return perPage;
}
