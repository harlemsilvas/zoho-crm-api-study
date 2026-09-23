import { createHash } from "node:crypto";
import express from "express";
import { getRequestId } from "../observability/requestContext.js";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const IDEMPOTENCY_MAX_ENTRIES = 1000;

export function createLeadsRouter(crmClient) {
  if (!crmClient) {
    throw new TypeError("Uma instância de ZohoCrmClient é obrigatória.");
  }

  const router = express.Router();
  const idempotencyEntries = new Map();

  router.get("/", async (request, response, next) => {
    try {
      const perPage = parsePerPage(request.query.per_page);
      const page = parsePage(request.query.page);
      const company = parseCompanyFilter(request.query.company);

      const result = await crmClient.listLeads({
        perPage,
        page,
        ...(company ? { company } : {}),
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
    let idempotencyKey;
    let fingerprint;

    try {
      idempotencyKey = getIdempotencyKey(request);
      fingerprint = createPayloadFingerprint(request.body);
      const existing = getActiveEntry(idempotencyEntries, idempotencyKey);

      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          throw new IdempotencyConflictError();
        }

        const cachedResponse = await existing.promise;
        response.setHeader("X-Idempotent-Replay", "true");
        response.status(200).json(cachedResponse);
        return;
      }

      const operation = (async () => {
        const result = await crmClient.createLead(request.body);
        const created = getSuccessfulOperation(
          result,
          "A criação do Lead não foi confirmada.",
        );

        return {
          success: true,
          data: {
            id: created.details?.id,
            code: created.code,
            message: created.message,
          },
        };
      })();

      pruneIdempotencyEntries(idempotencyEntries);
      idempotencyEntries.set(idempotencyKey, {
        fingerprint,
        expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
        promise: operation,
      });

      const body = await operation;
      response.status(201).json(body);
    } catch (error) {
      const entry = idempotencyEntries.get(idempotencyKey);

      if (entry?.fingerprint === fingerprint && entry.promise) {
        idempotencyEntries.delete(idempotencyKey);
      }

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
      if (request.get("X-Confirm-Update") !== "true") {
        throw new TypeError(
          "Atualização bloqueada. Informe X-Confirm-Update: true.",
        );
      }

      const result = await crmClient.updateLead(
        request.params.id,
        request.body,
        {
          confirm: true,
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
    const error = new Error(errorMessage);
    error.name = "ZohoApiError";
    error.status = 502;
    error.code = "ZOHO_OPERATION_ERROR";
    throw error;
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


function parsePage(value) {
  if (value === undefined) {
    return 1;
  }

  const normalizedValue = String(value).trim();

  if (!/^\d+$/.test(normalizedValue)) {
    throw new TypeError("page deve ser um número inteiro.");
  }

  const page = Number(normalizedValue);

  if (page < 1 || page > 200) {
    throw new TypeError("page deve estar entre 1 e 200.");
  }

  return page;
}

function parseCompanyFilter(value) {
  if (value === undefined) {
    return undefined;
  }

  const company = String(value).trim();

  if (!company) {
    throw new TypeError("company não pode ficar vazio.");
  }

  if (company.length > 200 || /[():\\]/.test(company)) {
    throw new TypeError("company possui um formato inválido.");
  }

  return company;
}

function getIdempotencyKey(request) {
  const explicitKey = request.get("Idempotency-Key")?.trim();
  const requestId = request.get("X-Request-ID")?.trim() || getRequestId();
  const key = explicitKey || requestId;

  if (!key || key.length > 128 || !/^[A-Za-z0-9._-]+$/.test(key)) {
    throw new TypeError(
      "Idempotency-Key deve conter até 128 caracteres seguros.",
    );
  }

  return key;
}

function createPayloadFingerprint(payload) {
  return createHash("sha256")
    .update(JSON.stringify(payload ?? null))
    .digest("hex");
}

function pruneIdempotencyEntries(entries) {
  const now = Date.now();

  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) {
      entries.delete(key);
    }
  }

  while (entries.size >= IDEMPOTENCY_MAX_ENTRIES) {
    entries.delete(entries.keys().next().value);
  }
}

function getActiveEntry(entries, key) {
  const entry = entries.get(key);

  if (entry && entry.expiresAt <= Date.now()) {
    entries.delete(key);
    return undefined;
  }

  return entry;
}

class IdempotencyConflictError extends Error {
  code = "IDEMPOTENCY_KEY_REUSED";
  statusCode = 409;

  constructor() {
    super("O identificador de idempotência já foi usado com outro payload.");
  }
}
