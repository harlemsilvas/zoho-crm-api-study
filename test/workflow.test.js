import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = JSON.parse(
  fs.readFileSync(new URL("../n8n/workflows/zoho-create-lead.json", import.meta.url), "utf8"),
);
const updateWorkflow = JSON.parse(
  fs.readFileSync(new URL("../n8n/workflows/zoho-update-lead.json", import.meta.url), "utf8"),
);

function nodeNamed(name) {
  const node = workflow.nodes.find((candidate) => candidate.name === name);
  assert.ok(node, `Nó ausente: ${name}`);
  return node;
}

test("workflow propaga o ID da execução para a API e para todas as respostas", () => {
  const request = nodeNamed("Criar Lead na API");
  assert.equal(request.parameters.sendHeaders, true);
  assert.equal(request.parameters.specifyHeaders, "json");
  assert.match(request.parameters.jsonHeaders, /X-Request-ID/);
  assert.match(request.parameters.jsonHeaders, /\$execution\.id/);

  for (const name of [
    "Responder validação inválida",
    "Responder sucesso",
    "Responder erro da API",
  ]) {
    const responseHeaders = nodeNamed(name).parameters.options.responseHeaders;
    assert.deepEqual(responseHeaders.entries[0].name, "X-Request-ID");
    assert.match(responseHeaders.entries[0].value, /\$execution\.id/);
  }
});


test("workflow mantém o contrato público de validação, sucesso e erro", () => {
  const invalid = nodeNamed("Responder validação inválida");
  assert.equal(invalid.parameters.options.responseCode, 400);
  assert.match(invalid.parameters.responseBody, /VALIDATION_ERROR/);
  assert.match(invalid.parameters.responseBody, /details/);

  const success = nodeNamed("Responder sucesso");
  assert.match(String(success.parameters.options.responseCode), /\$json\.statusCode/);
  assert.equal(success.parameters.responseBody, "={{ $json.body }}");

  const failure = nodeNamed("Responder erro da API");
  assert.match(String(failure.parameters.options.responseCode), /\$json\.statusCode/);
  assert.match(failure.parameters.responseBody, /ZOHO_API_ERROR/);
  assert.match(failure.parameters.responseBody, /Não foi possível criar o Lead/);
});

test("workflow mantém o contrato do nó HTTP e os caminhos públicos", () => {
  const request = nodeNamed("Criar Lead na API");
  const responseOptions = request.parameters.options?.response?.response;

  assert.equal(request.parameters.method, "POST");
  assert.equal(request.parameters.url, "http://zoho-api:3000/api/leads");
  assert.equal(responseOptions.fullResponse, true);
  assert.equal(responseOptions.neverError, true);
  assert.equal(responseOptions.responseFormat, "json");

  const connections = workflow.connections;
  assert.deepEqual(connections["Lead válido?"]?.main?.[0]?.[0]?.node, "Criar Lead na API");
  assert.deepEqual(connections["Lead válido?"]?.main?.[1]?.[0]?.node, "Responder validação inválida");
  assert.deepEqual(connections["API respondeu com sucesso?"]?.main?.[0]?.[0]?.node, "Responder sucesso");
  assert.deepEqual(connections["API respondeu com sucesso?"]?.main?.[1]?.[0]?.node, "Responder erro da API");
});


function updateNodeNamed(name) {
  const node = updateWorkflow.nodes.find((candidate) => candidate.name === name);
  assert.ok(node, `Nó de atualização ausente: ${name}`);
  return node;
}

test("workflow de atualização exige ID, confirmação e propaga a correlação", () => {
  const webhook = updateNodeNamed("Webhook");
  assert.equal(webhook.parameters.httpMethod, "POST");
  assert.equal(webhook.parameters.path, "zoho/leads/update");
  assert.equal(webhook.parameters.authentication, "headerAuth");

  const validator = updateNodeNamed("Validar e normalizar atualização");
  assert.match(validator.parameters.jsCode, /leadId/);
  assert.match(validator.parameters.jsCode, /Informe pelo menos um campo/);

  const request = updateNodeNamed("Atualizar Lead na API");
  assert.equal(request.parameters.method, "PATCH");
  assert.match(request.parameters.url, /zoho-api:3000\/api\/leads/);
  assert.match(request.parameters.jsonHeaders, /X-Confirm-Update/);
  assert.match(request.parameters.jsonHeaders, /X-Request-ID/);
  assert.equal(request.parameters.options.response.response.fullResponse, true);
  assert.equal(request.parameters.options.response.response.neverError, true);
});

test("workflow de atualização cobre respostas públicas e caminhos", () => {
  const invalid = updateNodeNamed("Responder validação inválida");
  assert.equal(invalid.parameters.options.responseCode, 400);
  assert.match(invalid.parameters.responseBody, /VALIDATION_ERROR/);

  const success = updateNodeNamed("Responder atualização bem-sucedida");
  assert.match(String(success.parameters.options.responseCode), /\$json\.statusCode/);
  assert.equal(success.parameters.responseBody, "={{ $json.body }}");

  const failure = updateNodeNamed("Responder erro da atualização");
  assert.match(String(failure.parameters.options.responseCode), /\$json\.statusCode/);
  assert.match(failure.parameters.responseBody, /ZOHO_API_ERROR/);

  assert.equal(updateWorkflow.connections["Atualização válida?"]?.main?.[0]?.[0]?.node, "Atualizar Lead na API");
  assert.equal(updateWorkflow.connections["Atualização válida?"]?.main?.[1]?.[0]?.node, "Responder validação inválida");
  assert.equal(updateWorkflow.connections["API respondeu com sucesso?"]?.main?.[0]?.[0]?.node, "Responder atualização bem-sucedida");
  assert.equal(updateWorkflow.connections["API respondeu com sucesso?"]?.main?.[1]?.[0]?.node, "Responder erro da atualização");
});
