import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = JSON.parse(
  fs.readFileSync(new URL("../n8n/workflows/zoho-create-lead.json", import.meta.url), "utf8"),
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
