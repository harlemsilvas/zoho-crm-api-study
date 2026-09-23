import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createApp } from "../src/app.js";

let server;
let baseUrl;

const crmCalls = {
  listLeads: [],
  getLead: [],
  createLead: [],
  updateLead: [],
};

const crmClient = {
  config: {
    clientId: "client-id",
    clientSecret: "client-secret",
    refreshToken: "refresh-token",
    accountsUrl: "https://accounts.example.test",
    apiDomain: "https://api.example.test",
    customSourceField: "Source",
  },

  async listLeads(options) {
    crmCalls.listLeads.push(options);

    return {
      data: [
        {
          id: "7603449000000701003",
          Last_Name: "Laboratório",
          Company: "HDev Soluções",
        },
      ],
      info: {
        count: 1,
      },
    };
  },

  async getLead(leadId) {
    crmCalls.getLead.push(leadId);

    return {
      data: [
        {
          id: leadId,
          Last_Name: "Laboratório",
          Company: "HDev Soluções",
        },
      ],
    };
  },

  async createLead(data) {
    crmCalls.createLead.push(data);

    return {
      data: [
        {
          status: "success",
          code: "SUCCESS",
          message: "record added",
          details: {
            id: "7603449000000705001",
          },
        },
      ],
    };
  },

  async updateLead(leadId, data, options) {
    crmCalls.updateLead.push({
      leadId,
      data,
      options,
    });

    if (!options.confirm) {
      throw new TypeError(
        "Atualização bloqueada. Informe a confirmação explícita.",
      );
    }

    return {
      data: [
        {
          status: "success",
          code: "SUCCESS",
          message: "record updated",
          details: {
            id: leadId,
          },
        },
      ],
    };
  },
};

before(async () => {
  const app = createApp({ crmClient });

  server = app.listen(0, "127.0.0.1");

  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const address = server.address();

  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (!server) {
    return;
  }

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
});

test("GET /health retorna o estado da API", async () => {
  const response = await fetch(`${baseUrl}/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    status: "ok",
    service: "zoho-crm-api-study",
  });
});


test("GET /readiness confirma a configuração sem chamar o cliente Zoho", async () => {
  const response = await fetch(`${baseUrl}/readiness`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    status: "ready",
    service: "zoho-crm-api-study",
    checks: {
      zoho_configuration: "ok",
    },
  });
});

test("GET /readiness retorna 503 quando o cliente não está configurado", async (t) => {
  const readinessServer = createApp().listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve, reject) => {
    readinessServer.close((error) => error ? reject(error) : resolve());
  }));
  await new Promise((resolve, reject) => {
    readinessServer.once("listening", resolve);
    readinessServer.once("error", reject);
  });

  const address = readinessServer.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/readiness`);
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.deepEqual(body, {
    status: "not_ready",
    service: "zoho-crm-api-study",
    checks: {
      zoho_configuration: "not_configured",
    },
  });
});

test("rota inexistente retorna erro padronizado", async () => {
  const response = await fetch(`${baseUrl}/rota-inexistente`);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.deepEqual(body, {
    success: false,
    error: {
      code: "ROUTE_NOT_FOUND",
      message: "Rota não encontrada.",
    },
  });
});

test("JSON inválido retorna 400", async () => {
  const response = await fetch(`${baseUrl}/api/leads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: '{"Last_Name":',
  });

  const body = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(body, {
    success: false,
    error: {
      code: "INVALID_JSON",
      message: "O corpo da requisição contém JSON inválido.",
    },
  });
});

test("falhas Zoho retornam códigos públicos padronizados", async (t) => {
  const upstreamFailures = [
    [401, "ZOHO_AUTH_ERROR", "Não foi possível autenticar na Zoho."],
    [429, "ZOHO_RATE_LIMITED", "A Zoho limitou a requisição. Tente novamente mais tarde."],
    [500, "ZOHO_API_ERROR", "Não foi possível concluir a operação na Zoho."],
  ];

  for (const [status, code, message] of upstreamFailures) {
    const app = createApp({
      crmClient: {
        ...crmClient,
        async createLead() {
          const error = new Error("mensagem externa não deve aparecer");
          error.name = "ZohoApiError";
          error.status = status;
          throw error;
        },
      },
    });
    const testServer = app.listen(0, "127.0.0.1");
    t.after(() => new Promise((resolve, reject) => {
      testServer.close((error) => error ? reject(error) : resolve());
    }));
    await new Promise((resolve, reject) => {
      testServer.once("listening", resolve);
      testServer.once("error", reject);
    });

    const address = testServer.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Last_Name: "Falha", Company: "HDev" }),
    });

    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      success: false,
      error: { code, message },
    });
  }
});

test("GET /api/leads retorna a lista de Leads", async () => {
  const response = await fetch(`${baseUrl}/api/leads?per_page=5`);

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.length, 1);
  assert.equal(body.info.count, 1);
  assert.deepEqual(crmCalls.listLeads.at(-1), {
    perPage: 5,
    page: 1,
  });
});

test("GET /api/leads aceita página e filtro de empresa", async () => {
  const response = await fetch(
    `${baseUrl}/api/leads?page=2&per_page=25&company=HDev%20Soluções`,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(crmCalls.listLeads.at(-1), {
    perPage: 25,
    page: 2,
    company: "HDev Soluções",
  });
});

test("GET /api/leads rejeita página e filtro inválidos", async () => {
  for (const [query, message] of [
    ["page=abc", "page deve ser um número inteiro."],
    ["company=", "company não pode ficar vazio."],
    ["company=%28HDev%29", "company possui um formato inválido."],
  ]) {
    const response = await fetch(`${baseUrl}/api/leads?${query}`);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(body.error, {
      code: "VALIDATION_ERROR",
      message,
    });
  }
});

test("GET /api/leads/:id retorna um Lead", async () => {
  const leadId = "7603449000000701003";

  const response = await fetch(`${baseUrl}/api/leads/${leadId}`);

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.id, leadId);
  assert.equal(crmCalls.getLead.at(-1), leadId);
});

test("GET /api/leads rejeita per_page inválido", async () => {
  const response = await fetch(`${baseUrl}/api/leads?per_page=abc`);

  const body = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(body, {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "per_page deve ser um número inteiro.",
    },
  });
});

test("POST /api/leads cria um Lead", async () => {
  const lead = {
    First_Name: "Cliente",
    Last_Name: "API Express",
    Company: "HDev Soluções",
    Email: "express@example.com",
    Lista_de_op_es: "API",
  };

  const response = await fetch(`${baseUrl}/api/leads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(lead),
  });

  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.success, true);
  assert.equal(body.data.id, "7603449000000705001");
  assert.deepEqual(crmCalls.createLead.at(-1), lead);
});

test("POST /api/leads reutiliza a resposta para o mesmo X-Request-ID", async () => {
  const lead = {
    Last_Name: "Reenvio idempotente",
    Company: "HDev Soluções",
  };
  const headers = {
    "Content-Type": "application/json",
    "X-Request-ID": "n8n-idempotency-001",
  };

  const firstResponse = await fetch(`${baseUrl}/api/leads`, {
    method: "POST",
    headers,
    body: JSON.stringify(lead),
  });
  const firstBody = await firstResponse.json();

  const replayResponse = await fetch(`${baseUrl}/api/leads`, {
    method: "POST",
    headers,
    body: JSON.stringify(lead),
  });
  const replayBody = await replayResponse.json();

  assert.equal(firstResponse.status, 201);
  assert.equal(replayResponse.status, 200);
  assert.equal(replayResponse.headers.get("X-Idempotent-Replay"), "true");
  assert.deepEqual(replayBody, firstBody);
  assert.equal(
    crmCalls.createLead.filter(
      (call) => call.Last_Name === lead.Last_Name,
    ).length,
    1,
  );
});

test("POST /api/leads rejeita chave reutilizada com payload diferente", async () => {
  const headers = {
    "Content-Type": "application/json",
    "Idempotency-Key": "n8n-idempotency-002",
  };

  await fetch(`${baseUrl}/api/leads`, {
    method: "POST",
    headers,
    body: JSON.stringify({ Last_Name: "Primeiro", Company: "HDev" }),
  });

  const response = await fetch(`${baseUrl}/api/leads`, {
    method: "POST",
    headers,
    body: JSON.stringify({ Last_Name: "Segundo", Company: "HDev" }),
  });
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.deepEqual(body, {
    success: false,
    error: {
      code: "IDEMPOTENCY_KEY_REUSED",
      message: "O identificador de idempotência já foi usado com outro payload.",
    },
  });
});

test("PATCH /api/leads/:id exige confirmação", async () => {
  const leadId = "7603449000000705001";

  const blockedResponse = await fetch(`${baseUrl}/api/leads/${leadId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      Description: "Atualização bloqueada",
    }),
  });

  const blockedBody = await blockedResponse.json();

  assert.equal(blockedResponse.status, 400);
  assert.deepEqual(blockedBody, {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Atualização bloqueada. Informe X-Confirm-Update: true.",
    },
  });
  assert.equal(crmCalls.updateLead.at(-1), undefined);

  const confirmedResponse = await fetch(`${baseUrl}/api/leads/${leadId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Confirm-Update": "true",
    },
    body: JSON.stringify({
      Description: "Atualizado pela API Express",
    }),
  });

  const confirmedBody = await confirmedResponse.json();

  assert.equal(confirmedResponse.status, 200);
  assert.equal(confirmedBody.success, true);
  assert.equal(confirmedBody.data.id, leadId);

  assert.deepEqual(crmCalls.updateLead.at(-1), {
    leadId,
    data: {
      Description: "Atualizado pela API Express",
    },
    options: {
      confirm: true,
    },
  });
});
