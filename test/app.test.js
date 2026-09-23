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

test("GET /api/leads retorna a lista de Leads", async () => {
  const response = await fetch(`${baseUrl}/api/leads?per_page=5`);

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.length, 1);
  assert.equal(body.info.count, 1);
  assert.deepEqual(crmCalls.listLeads.at(-1), {
    perPage: 5,
  });
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
  assert.equal(blockedBody.success, false);
  assert.equal(blockedBody.error.code, "VALIDATION_ERROR");

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
