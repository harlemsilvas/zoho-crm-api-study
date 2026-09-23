import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = JSON.parse(await readFile("n8n/workflows/zoho-create-lead.json", "utf8"));
const nodes = workflow.nodes ?? [];
const byName = new Map(nodes.map((node) => [node.name, node]));

assert.ok(nodes.length > 0, "workflow sem nós");
assert.equal(new Set(nodes.map((node) => node.name)).size, nodes.length, "nomes de nós duplicados");

const webhook = byName.get("Webhook");
assert.equal(webhook?.parameters?.httpMethod, "POST", "webhook deve aceitar POST");
assert.equal(webhook?.parameters?.path, "zoho/leads", "caminho do webhook alterado");
assert.equal(webhook?.parameters?.authentication, "headerAuth", "autenticação do webhook alterada");

const createLead = byName.get("Criar Lead na API");
assert.equal(createLead?.parameters?.method, "POST", "nó da API deve usar POST");
assert.equal(createLead?.parameters?.url, "http://zoho-api:3000/api/leads", "destino interno da API alterado");
assert.match(createLead?.parameters?.jsonHeaders ?? "", /X-Request-ID/);
assert.match(createLead?.parameters?.jsonHeaders ?? "", /\$execution\.id/);

for (const name of [
  "Responder validação inválida",
  "Responder sucesso",
  "Responder erro da API",
]) {
  const node = byName.get(name);
  const headers = node?.parameters?.options?.responseHeaders?.entries ?? [];
  assert.ok(
    headers.some((entry) => entry.name === "X-Request-ID"),
    `${name} sem X-Request-ID`,
  );
}

assert.ok(Object.keys(workflow.connections ?? {}).length > 0, "workflow sem conexões");
console.log("workflow validation: ok");
