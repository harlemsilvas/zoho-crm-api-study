# Handoff para o Codex — Zoho CRM API Study

## Objetivo desta sessão

Continuar o desenvolvimento do repositório `zoho-crm-api-study` na fase:

```text
feat/structured-logs
```

Implementar logs estruturados e correlação de requisições no caminho:

```text
n8n → API Express → Zoho CRM
```

O trabalho deve preservar todos os comportamentos e testes existentes.

## Estado confirmado do projeto

- Repositório: `https://github.com/harlemsilvas/zoho-crm-api-study`
- Ambiente principal: Windows 11 + WSL Ubuntu + Docker Desktop.
- Runtime: Node.js 20.6 ou superior.
- API: Express.
- Zoho CRM API: V8.
- Testes: `node:test`, executados por `npm test`.
- Último resultado confirmado antes da fase n8n: 30 testes aprovados.
- OAuth usa Refresh Token para obter Access Token temporário.
- Access Token permanece somente em memória.
- Credenciais ficam no `.env`, que está ignorado pelo Git.
- A API lista, consulta, cria e atualiza Leads.
- Atualizações exigem confirmação explícita.
- Existe validação de entrada antes das chamadas ao Zoho.
- A API pode executar localmente ou em container.
- O n8n e a API executam na mesma rede Docker.
- O n8n chama a API por `http://zoho-api:3000`.
- O Webhook do n8n usa autenticação `Header Auth` com `X-Webhook-Key`.
- A chave do Webhook não está no workflow exportado.
- Workflow validado com respostas `401`, `400` e criação real de Lead.
- Criação confirmada pela API e pela interface do Zoho CRM.
- Versão validada do n8n: `2.38.6`.

## Infraestrutura existente

Arquivos esperados no repositório:

```text
Dockerfile
.dockerignore
.env.example
.env.n8n.example
compose.n8n.yaml
n8n/workflows/zoho-create-lead.json
src/app.js
src/server.js
src/config.js
src/zohoClient.js
src/leadValidation.js
src/routes/leadsRoutes.js
test/app.test.js
test/zohoClient.test.js
```

O Compose deve manter:

- API publicada apenas em `127.0.0.1:3000`;
- n8n publicado apenas em `127.0.0.1:5678`;
- rede interna entre `n8n` e `zoho-api`;
- volume persistente do n8n;
- health check da API;
- imagem do n8n fixada em `2.38.6`.

## Regras obrigatórias

1. Antes de alterar qualquer arquivo, inspecione o repositório e leia `AGENTS.md`, caso exista.
2. Confirme a branch e a árvore de trabalho.
3. Preserve mudanças já existentes do usuário.
4. Não faça alterações fora da fase de observabilidade.
5. Não leia nem exiba valores de `.env` ou `.env.n8n`.
6. Nunca registre tokens, segredos, cookies, headers de autenticação ou payload completo de Leads.
7. Não adicione dependências sem justificar a necessidade.
8. Prefira recursos nativos do Node.js nesta fase.
9. Use `apply_patch` para alterações manuais.
10. Execute testes depois de cada conjunto coerente de mudanças.
11. Não faça commit ou push sem autorização explícita.

## Diagnóstico inicial obrigatório

Execute:

```bash
git branch --show-current
git status --short
rg --files -g 'AGENTS.md' -g '!node_modules'
sed -n '1,280p' src/app.js
sed -n '1,320p' src/routes/leadsRoutes.js
sed -n '1,380p' src/zohoClient.js
sed -n '1,260p' src/server.js
rg -n "console\\.|fetch\\(|Authorization|createApp|createServer" src test
npm test
```

Se a branch não for `feat/structured-logs`, pare e informe o usuário.

## Próxima entrega

Ler `docs/STRUCTURED_LOGGING_SPEC.md` e implementar a especificação em etapas pequenas, começando pelo contexto de requisição e respectivos testes.

## Comandos da infraestrutura

Subir os serviços:

```bash
docker compose --env-file .env.n8n -f compose.n8n.yaml up -d
```

Verificar:

```bash
docker compose --env-file .env.n8n -f compose.n8n.yaml ps
```

Testar a comunicação interna:

```bash
docker exec zoho-study-n8n node -e "fetch('http://zoho-api:3000/health').then(async r => console.log(r.status, await r.text())).catch(e => console.error(e.cause?.code ?? e.message))"
```

Encerrar preservando os volumes:

```bash
docker compose --env-file .env.n8n -f compose.n8n.yaml stop
```

Nunca use `docker compose down -v` neste projeto sem autorização explícita.

