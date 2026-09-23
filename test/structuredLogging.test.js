import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { createApp } from "../src/app.js";
import { ZohoCrmClient } from "../src/zohoClient.js";
import { createLogger } from "../src/observability/logger.js";
import { getRequestId } from "../src/observability/requestContext.js";

const config = {
  clientId: "PRIVATE_CLIENT_ID", clientSecret: "PRIVATE_CLIENT_SECRET",
  refreshToken: "PRIVATE_REFRESH_TOKEN", accountsUrl: "https://oauth.example.test",
  apiDomain: "https://crm.example.test", customSourceField: "Lista_de_op_es",
};
const lead = {
  First_Name: "PRIVATE_FIRST_NAME", Last_Name: "PRIVATE_LAST_NAME",
  Company: "PRIVATE_COMPANY", Email: "PRIVATE_EMAIL@example.test",
  Description: "PRIVATE_DESCRIPTION", Lista_de_op_es: "API",
};

function capture() {
  const lines = [];
  return {
    lines,
    logger: createLogger({ write: (line) => lines.push(line) }),
    records: () => lines.map((line) => JSON.parse(line)),
  };
}

function assertSafe(logs) {
  const output = logs.lines.join("");
  assert.doesNotMatch(output, /PRIVATE_|example\.test|Authorization|Zoho-oauthtoken|access_token|refresh_token|client_secret|X-Webhook-Key/i);
  for (const record of logs.records()) {
    if (!record.event.endsWith("_started")) {
      assert.ok(Number.isFinite(record.duration_ms));
      assert.ok(record.duration_ms >= 0);
    }
  }
}

async function startApp(t, options) {
  const server = createApp(options).listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}

function cachedClient(fetchMock, logger) {
  const client = new ZohoCrmClient({ ...config }, fetchMock, { logger });
  client.accessToken = "PRIVATE_ACCESS_TOKEN";
  client.accessTokenExpiresAt = Date.now() + 3_600_000;
  return client;
}

test("HTTP registra status, duração e ID em sucesso, validação, JSON inválido, 404 e 500", async (t) => {
  const logs = capture();
  const baseUrl = await startApp(t, {
    logger: logs.logger,
    crmClient: {
      async getLead() { return { data: [] }; },
      async listLeads() { throw new Error("PRIVATE_ERROR_MESSAGE"); },
    },
  });
  const cases = [
    ["/health?token=PRIVATE_QUERY", {}, 200, "/health"],
    ["/readiness", {}, 503, "/readiness"],
    ["/api/leads/PRIVATE_PATH", {}, 200, "/api/leads/:id"],
    ["/api/leads?per_page=PRIVATE_QUERY", {}, 400, "/api/leads"],
    ["/PRIVATE_UNKNOWN_PATH", {}, 404, "[unmatched]"],
    ["/api/leads", { method: "POST", body: '{"PRIVATE_BODY":', headers: {
      "Content-Type": "application/json",
    } }, 400, "/api/leads"],
    ["/api/leads", {}, 500, "/api/leads"],
  ];
  for (const [path, options, status, loggedPath] of cases) {
    const before = logs.lines.length;
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        ...options.headers,
        "X-Request-ID": `http-${before}`,
        Authorization: "PRIVATE_AUTH", Cookie: "PRIVATE_COOKIE",
        "X-Webhook-Key": "PRIVATE_WEBHOOK",
      },
    });
    await response.json();
    assert.equal(response.status, status);
    const events = logs.records().slice(before);
    const completed = events.filter((event) => event.event === "http_request_completed");
    assert.equal(completed.length, 1);
    assert.equal(completed[0].request_id, response.headers.get("X-Request-ID"));
    assert.equal(completed[0].path, loggedPath);
    assert.equal(completed[0].status, status);
    assert.equal(completed[0].method, options.method ?? "GET");
    assert.equal(completed[0].level, status >= 500 ? "error" : status >= 400 ? "warn" : "info");
    assert.equal(events.length, status === 500 ? 2 : 1);
    if (status === 500) {
      assert.equal(events[0].event, "http_request_failed");
      assert.equal(events[0].error_name, "Error");
      assert.equal(events[0].request_id, completed[0].request_id);
    }
  }
  assertSafe(logs);
});

test("cliente registra as quatro operações sem payload, ID do Lead ou headers", async () => {
  const operations = [
    ["list_leads", (client) => client.listLeads()],
    ["get_lead", (client) => client.getLead("7603449000000701003")],
    ["create_lead", (client) => client.createLead(lead)],
    ["update_lead", (client) => client.updateLead("7603449000000701003", lead, { confirm: true })],
  ];
  for (const [operation, invoke] of operations) {
    const logs = capture();
    const result = { data: [{ status: "success", ...lead, details: { id: "7603449000000701003" } }] };
    const client = cachedClient(async () => new Response(JSON.stringify(result), { status: 200 }), logs.logger);
    assert.deepEqual(await invoke(client), result);
    const events = logs.records();
    assert.deepEqual(events.map((event) => event.event), ["zoho_operation_started", "zoho_operation_succeeded"]);
    assert.ok(events.every((event) => event.operation === operation));
    assert.equal(events[1].status, 200);
    assert.equal(logs.lines.join("").includes("7603449000000701003"), false);
    assertSafe(logs);
  }
});

test("cliente registra falhas HTTP, de rede, JSON e de negócio sem texto externo", async () => {
  const scenarios = [
    { fetch: async () => new Response(JSON.stringify({ code: "INVALID_DATA", message: "PRIVATE_ERROR", details: lead }), { status: 400 }), status: 400, code: "INVALID_DATA" },
    { fetch: async () => { throw new Error("PRIVATE_NETWORK_ERROR"); } },
    { fetch: async () => new Response("PRIVATE_NOT_JSON", { status: 502 }), status: 502 },
    { fetch: async () => new Response(JSON.stringify({ data: [{ status: "error", code: "PRIVATE_UNKNOWN_CODE", message: "PRIVATE_ERROR" }] }), { status: 200 }), status: 200, business: true },
  ];
  for (const scenario of scenarios) {
    const logs = capture();
    const client = cachedClient(scenario.fetch, logs.logger);
    if (scenario.business) {
      const result = await client.createLead(lead);
      assert.equal(result.data[0].status, "error");
    } else {
      await assert.rejects(() => client.createLead(lead));
    }
    const events = logs.records();
    assert.deepEqual(events.map((event) => event.event), ["zoho_operation_started", "zoho_operation_failed"]);
    assert.equal(events[1].status, scenario.status);
    assert.equal(events[1].code, scenario.code);
    assertSafe(logs);
  }
});

test("renovação OAuth registra falhas e ausência de token sem vazar credenciais", async () => {
  for (const status of [200, 401]) {
    const logs = capture();
    const client = new ZohoCrmClient({ ...config }, async () => new Response(JSON.stringify({
      error: "invalid_client", message: "PRIVATE_ERROR", ...lead,
    }), { status }), { logger: logs.logger });
    await assert.rejects(() => client.listLeads());
    const events = logs.records();
    assert.deepEqual(events.map((event) => event.event), [
      "zoho_operation_started", "zoho_token_refresh_started",
      "zoho_token_refresh_failed", "zoho_operation_failed",
    ]);
    assert.equal(events[2].status, status);
    assert.equal(events[2].code, "invalid_client");
    assert.equal(events[3].status, undefined);
    assertSafe(logs);
  }
});

test("correlaciona HTTP, OAuth e Zoho inclusive com IDs gerados", async (t) => {
  const logs = capture();
  const fetchMock = async (url) => {
    await setImmediate();
    return new Response(JSON.stringify(String(url).includes("/oauth/")
      ? { access_token: "PRIVATE_ACCESS_TOKEN", expires_in: 3600 }
      : { data: [{ status: "success", code: "SUCCESS", details: { id: "7603449000000701003" } }] }), { status: 200 });
  };
  const client = new ZohoCrmClient({ ...config }, fetchMock, { logger: logs.logger });
  const baseUrl = await startApp(t, { crmClient: client, logger: logs.logger });
  for (const suppliedId of [undefined, "n8n-execution-001"]) {
    client.accessToken = null;
    const before = logs.lines.length;
    const response = await fetch(`${baseUrl}/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(suppliedId ? { "X-Request-ID": suppliedId } : {}) },
      body: JSON.stringify(lead),
    });
    await response.json();
    assert.equal(response.status, 201);
    const id = response.headers.get("X-Request-ID");
    assert.ok(id);
    const events = logs.records().slice(before);
    assert.deepEqual(events.map((event) => event.event), [
      "zoho_operation_started", "zoho_token_refresh_started",
      "zoho_token_refresh_succeeded", "zoho_operation_succeeded", "http_request_completed",
    ]);
    assert.ok(events.every((event) => event.request_id === id));
  }
  assertSafe(logs);
});

test("logs HTTP e Zoho de requisições simultâneas não misturam IDs", { timeout: 5000 }, async (t) => {
  const logs = capture();
  let arrived = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const observations = [];
  const client = cachedClient(async () => {
    const id = getRequestId();
    if (++arrived === 3) release();
    await gate;
    await setImmediate();
    observations.push([id, getRequestId()]);
    if (id === "parallel-2") throw new Error("PRIVATE_NETWORK_ERROR");
    return new Response(JSON.stringify({ data: [] }));
  }, logs.logger);
  const baseUrl = await startApp(t, { crmClient: client, logger: logs.logger });
  await Promise.all([1, 2, 3].map(async (index) => {
    const response = await fetch(`${baseUrl}/api/leads`, { headers: { "X-Request-ID": `parallel-${index}` } });
    await response.json();
    assert.equal(response.status, index === 2 ? 500 : 200);
  }));
  for (const index of [1, 2, 3]) {
    const events = logs.records().filter((event) => event.request_id === `parallel-${index}`);
    assert.deepEqual(events.map((event) => event.event), index === 2
      ? ["zoho_operation_started", "zoho_operation_failed", "http_request_failed", "http_request_completed"]
      : ["zoho_operation_started", "zoho_operation_succeeded", "http_request_completed"]);
  }
  assert.ok(observations.every(([before, after]) => before === after));
  assert.equal(getRequestId(), undefined);
  assertSafe(logs);
});

test("falha do destino de logs não altera o sucesso da operação", async () => {
  const logger = createLogger({ write() { throw new Error("sink failed"); } });
  const client = cachedClient(async () => new Response('{"data":[]}'), logger);
  assert.deepEqual(await client.listLeads(), { data: [] });
});
