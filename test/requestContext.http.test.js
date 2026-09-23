import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { createApp } from "../src/app.js";
import { getRequestId } from "../src/observability/requestContext.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function startApp(t, crmClient) {
  const server = createApp({ crmClient }).listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}

test("HTTP gera ou normaliza X-Request-ID sem mudar o JSON", async (t) => {
  const baseUrl = await startApp(t);
  for (const value of [undefined, "  n8n-001.A_b  ", "a".repeat(128), "invalid/id", "a".repeat(129), "one,two"]) {
    const response = await fetch(`${baseUrl}/health`, {
      headers: value === undefined ? {} : { "X-Request-ID": value },
    });
    assert.equal(response.status, 200);
    if (value === "  n8n-001.A_b  " || value === "a".repeat(128)) {
      assert.equal(response.headers.get("X-Request-ID"), value.trim());
    } else {
      assert.match(response.headers.get("X-Request-ID"), uuidPattern);
    }
    assert.deepEqual(await response.json(), {
      status: "ok",
      service: "zoho-crm-api-study",
    });
  }
});

test("HTTP preserva correlação em 400, 404 e 500 com ID fornecido ou gerado", async (t) => {
  const baseUrl = await startApp(t, {
    async listLeads() {
      await setImmediate();
      throw new Error("falha simulada");
    },
  });
  const cases = [
    ["/missing", {}, 404, "ROUTE_NOT_FOUND", "Rota não encontrada."],
    ["/api/leads?per_page=abc", {}, 400, "VALIDATION_ERROR", "per_page deve ser um número inteiro."],
    ["/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"Last_Name":',
    }, 400, "INVALID_JSON", "O corpo da requisição contém JSON inválido."],
    ["/api/leads", {}, 500, "INTERNAL_ERROR", "Ocorreu um erro interno."],
  ];
  for (const [path, options, status, code, message] of cases) {
    for (const id of [undefined, `error-${code}`]) {
      const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
          ...options.headers,
          ...(id ? { "X-Request-ID": id } : {}),
        },
      });
      assert.equal(response.status, status);
      if (id) {
        assert.equal(response.headers.get("X-Request-ID"), id);
      } else {
        assert.match(response.headers.get("X-Request-ID"), uuidPattern);
      }
      assert.deepEqual(await response.json(), {
        success: false,
        error: { code, message },
      });
    }
  }
});

test("requisições HTTP concorrentes mantêm o ID nas operações assíncronas do cliente", { timeout: 5000 }, async (t) => {
  let release;
  let arrived = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  const observed = new Map();
  const baseUrl = await startApp(t, {
    async listLeads({ perPage }) {
      const before = getRequestId();
      if (++arrived === 3) release();
      await gate;
      await setImmediate();
      observed.set(perPage, [before, getRequestId()]);
      return { data: [] };
    },
  });
  await Promise.all([1, 2, 3].map(async (index) => {
    const id = `http-parallel-${index}`;
    const response = await fetch(`${baseUrl}/api/leads?per_page=${index}`, {
      headers: { "X-Request-ID": id },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Request-ID"), id);
    assert.deepEqual(await response.json(), { success: true, data: [], info: null });
    assert.deepEqual(observed.get(index), [id, id]);
  }));
  assert.equal(getRequestId(), undefined);
});
