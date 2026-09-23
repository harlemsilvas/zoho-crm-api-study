Vamos implementar sem biblioteca externa, usando recursos nativos do Node.js. O objetivo será produzir logs JSON pesquisáveis e um request_id comum durante toda a requisição.

Resultado esperado

Cada chamada deverá gerar logs semelhantes a:

```json
{
  "timestamp": "2026-09-22T14:30:00.000Z",
  "level": "info",
  "event": "http_request_completed",
  "request_id": "8de5e1b8-...",
  "method": "POST",
  "path": "/api/leads",
  "status": 201,
  "duration_ms": 842
}
```

O ID também será devolvido no cabeçalho:

```http
X-Request-ID: 8de5e1b8-...
```

Nunca registraremos:

Authorization;
Access Token;
Refresh Token;
Client Secret;
cookies;
chave do Webhook;
body completo do Lead;
nome, e-mail ou outros dados pessoais.
Arquitetura proposta

Criaremos:

```text
src/
├── observability/
│   ├── requestContext.js
│   └── logger.js
├── app.js
├── routes/
│   └── leadsRoutes.js
└── zohoClient.js

test/
├── app.test.js
├── logger.test.js
└── requestContext.test.js
```

Responsabilidades:

requestContext.js: gera ou aceita um X-Request-ID válido;
logger.js: escreve uma linha JSON por evento e remove campos sensíveis;
middleware HTTP: registra método, rota, status e duração;
ZohoCrmClient: registra início, sucesso e erro das operações sem tokens ou payloads;
testes: comprovam correlação e proteção dos segredos.

Primeiro passo: conferir a branch

```bash
git branch --show-current
git status --short
```

Esperado:

```text
feat/structured-logs
```

Criaremos primeiro requestContext.js e seus testes, preservando as validações que já estão funcionando.
