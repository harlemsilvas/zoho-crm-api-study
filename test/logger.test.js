import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { createLogger } from "../src/observability/logger.js";
import { requestContextMiddleware } from "../src/observability/requestContext.js";

function capture() {
  const lines = [];
  return { lines, logger: createLogger({ write: (line) => lines.push(line) }) };
}

test("logger produz uma linha JSON com timestamp, nível e evento", () => {
  const { lines, logger } = capture();
  for (const level of ["info", "warn", "error"]) {
    logger[level]("example_event", { status: 200, note: "linha\nnova" });
    const line = lines.at(-1);
    assert.equal(line.split("\n").length, 2);
    const record = JSON.parse(line);
    assert.equal(record.level, level);
    assert.equal(record.event, "example_event");
    assert.equal(record.status, 200);
    assert.equal(new Date(record.timestamp).toISOString(), record.timestamp);
    assert.equal(Object.hasOwn(record, "request_id"), false);
  }
});

test("logger usa o ID do contexto após await e protege campos reservados", async () => {
  const { lines, logger } = capture();
  await requestContextMiddleware(
    { headers: { "x-request-id": "logger-001" } },
    { setHeader() {} },
    async () => {
      await setImmediate();
      logger.info("real_event", {
        request_id: "forged", level: "forged", event: "forged", timestamp: "forged",
      });
    },
  );
  const record = JSON.parse(lines[0]);
  assert.equal(record.request_id, "logger-001");
  assert.equal(record.level, "info");
  assert.equal(record.event, "real_event");
  assert.notEqual(record.timestamp, "forged");
  logger.info("outside", { request_id: "forged" });
  assert.equal(Object.hasOwn(JSON.parse(lines[1]), "request_id"), false);
});

test("logger remove campos sensíveis recursivamente sem alterar a entrada", () => {
  const { lines, logger } = capture();
  const keys = [
    "Authorization", "COOKIE", "Set-Cookie", "access_token", "refresh_token",
    "client_secret", "client_id", "Password", "secret", "token", "X-Webhook-Key",
    "clientSecret", "refreshToken", "First_Name", "Last_Name", "Company",
    "Email", "Description", "headers", "body", "payload",
  ];
  const secrets = Object.fromEntries(keys.map((key) => [key, `private-${key}`]));
  const input = { ...secrets, nested: [{ ...secrets }], status: 200 };
  const original = structuredClone(input);
  logger.info("redaction", input);
  const record = JSON.parse(lines[0]);
  for (const key of keys) {
    assert.equal(record[key], "[REDACTED]");
    assert.equal(record.nested[0][key], "[REDACTED]");
    assert.equal(lines[0].includes(`private-${key}`), false);
  }
  assert.deepEqual(input, original);
  assert.equal(record.status, 200);
});

test("logger serializa erros sem mensagem, stack, causa ou propriedades sensíveis", () => {
  const { lines, logger } = capture();
  const error = new TypeError("private-message", { cause: new Error("private-cause") });
  error.details = { token: "private-token" };
  logger.error("failure", { error });
  assert.deepEqual(JSON.parse(lines[0]).error, { error_name: "TypeError" });
  error.name = "private-name";
  logger.error("failure", error);
  assert.equal(JSON.parse(lines[1]).error_name, "Error");
  assert.equal(lines.join("").includes("private-"), false);
});

test("logger aceita valores ausentes, arrays, bigint e referências circulares", () => {
  const { lines, logger } = capture();
  const circular = { status: 200 };
  circular.self = circular;
  for (const value of [undefined, null, [{ token: "private" }], circular, 1n]) {
    assert.doesNotThrow(() => logger.info("value", value));
    assert.doesNotThrow(() => JSON.parse(lines.at(-1)));
  }
  assert.equal(JSON.parse(lines[3]).self, "[Circular]");
  assert.equal(lines.join("").includes("private"), false);
  const shared = { status: 201 };
  logger.info("shared", { first: shared, second: shared });
  assert.deepEqual(JSON.parse(lines.at(-1)).first, JSON.parse(lines.at(-1)).second);
});

test("falha do destino e toJSON não comprometem a aplicação nem expõem o objeto", () => {
  const logger = createLogger({ write() { throw new Error("sink failed"); } });
  assert.doesNotThrow(() => logger.info("event", { status: 200 }));
  const captured = capture();
  captured.logger.info("event", { token: "private", toJSON() { return "private"; } });
  assert.equal(captured.lines.join("").includes("private"), false);
});
