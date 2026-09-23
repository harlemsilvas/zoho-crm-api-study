import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import {
  getRequestId,
  requestContextMiddleware,
} from "../src/observability/requestContext.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function runRequest(value, callback = () => {}) {
  const headers = new Map();
  return requestContextMiddleware(
    { headers: { "x-request-id": value } },
    { setHeader: (name, content) => headers.set(name, content) },
    () => callback(headers.get("X-Request-ID")),
  );
}

test("gera UUID distinto quando o header está ausente", () => {
  const first = runRequest(undefined, (id) => id);
  const second = runRequest(undefined, (id) => id);
  assert.match(first, uuidPattern);
  assert.match(second, uuidPattern);
  assert.notEqual(first, second);
});

test("preserva ID válido, remove espaços e aceita o limite de 128 caracteres", () => {
  for (const value of ["n8n-001.A_b", "a".repeat(128)]) {
    runRequest(`  ${value}  `, (id) => {
      assert.equal(id, value);
      assert.equal(getRequestId(), value);
    });
  }
});

test("substitui valores inválidos por UUID sem refletir quebras de linha", () => {
  for (const value of [
    "", "   ", "a".repeat(129), "id com espaço", "id/123", "ação",
    "id\nforjado", "id\rforjado", "\nid", "id\r\n", "id,segundo",
    null, 123, ["id"], { id: "id" }, new String("id"),
  ]) {
    runRequest(value, (id) => {
      assert.match(id, uuidPattern);
      assert.equal(getRequestId(), id);
    });
  }
});

test("disponibiliza o ID após operações assíncronas e não vaza para fora", async () => {
  assert.equal(getRequestId(), undefined);
  await runRequest("async-001", async (id) => {
    await Promise.resolve();
    assert.equal(getRequestId(), id);
    await setImmediate();
    assert.equal(getRequestId(), id);
  });
  assert.equal(getRequestId(), undefined);
});

test("mantém contextos concorrentes isolados", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const pending = Array.from({ length: 10 }, (_, index) =>
    runRequest(`parallel-${index}`, async (id) => {
      await gate;
      assert.equal(getRequestId(), id);
      await setImmediate();
      assert.equal(getRequestId(), id);
    }),
  );
  assert.equal(getRequestId(), undefined);
  release();
  await Promise.all(pending);
  assert.equal(getRequestId(), undefined);
});

test("restaura o contexto anterior mesmo após erro", () => {
  runRequest("outer", () => {
    assert.throws(() => runRequest("inner", () => {
      assert.equal(getRequestId(), "inner");
      throw new Error("falha simulada");
    }), /falha simulada/);
    assert.equal(getRequestId(), "outer");
  });
  assert.equal(getRequestId(), undefined);
});
