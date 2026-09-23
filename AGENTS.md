# AGENTS.md

Instruções compartilhadas para agentes que trabalham neste repositório.
Este arquivo é a referência principal do projeto; `CLAUDE.md` complementa o
comportamento esperado. Instruções explícitas do usuário prevalecem sobre estes
documentos, respeitadas as restrições da ferramenta e do ambiente.

## 1. Contexto do projeto

Laboratório Node.js para estudar OAuth 2.0 e a API V8 do Zoho CRM, com o fluxo
`n8n → API Express → Zoho CRM`.

- Node.js >= 20.6, JavaScript com ES modules e Express 5.
- Testes com `node:test` e `node:assert/strict`, executados por `npm test`.
- OAuth com Refresh Token; Access Token mantido somente em memória.
- Operações de listagem, consulta, criação e atualização de Leads.
- Ambiente de referência: Windows 11, WSL Ubuntu e Docker Desktop.
- Não há banco de dados da aplicação nem migrations neste repositório.

## 2. Leitura e diagnóstico antes de alterar arquivos

1. Leia este arquivo e eventuais instruções específicas do diretório afetado.
2. Leia integralmente `docs/CODEX_HANDOFF.md` e, para observabilidade,
   `docs/STRUCTURED_LOGGING_SPEC.md`.
3. Consulte `README.md`, `package.json`, a implementação e os testes relevantes.
   O README contém descrições históricas; confirme comportamentos no código e
   nos testes antes de tratá-los como atuais.
4. Execute `git branch --show-current` e `git status --short`. Identifique e
   preserve mudanças existentes, inclusive arquivos não rastreados.
5. Na fase de logs estruturados, a branch esperada é `feat/structured-logs`.
   Se divergir e não houver orientação explícita para outra branch, informe o
   usuário antes de alterar arquivos; não troque de branch automaticamente.
6. Antes de mudanças de código, execute a suíte existente e apresente um
   diagnóstico curto. Diferencie falhas do código de limitações do ambiente.

## 3. Mapa da implementação

| Arquivo | Responsabilidade |
| --- | --- |
| `src/app.js` | Fábrica Express, middlewares e respostas de erro |
| `src/routes/leadsRoutes.js` | Rotas HTTP de Leads |
| `src/leadValidation.js` | Validação e normalização de entrada |
| `src/zohoClient.js` | OAuth e chamadas à API Zoho |
| `src/config.js` | Validação da configuração |
| `src/server.js` | Inicialização e encerramento do servidor |
| `src/index.js` | Interface de linha de comando do laboratório |
| `src/observability/requestContext.js` | Contexto assíncrono e `X-Request-ID` |
| `src/observability/logger.js` | Logs JSON e redação defensiva |
| `src/observability/httpLogging.js` | Eventos HTTP, status e duração |
| `test/` | Testes unitários e HTTP com cliente/fetch simulados |
| `compose.n8n.yaml` | Infraestrutura local da API e do n8n |
| `n8n/workflows/zoho-create-lead.json` | Workflow exportado de criação de Lead |

## 4. Segurança e operações reais

- Não leia, imprima ou modifique os valores de `.env` e `.env.n8n`.
  Não exponha valores indiretamente por dumps de ambiente, configuração Docker
  interpolada, logs ou comandos de diagnóstico.
- Nunca registre tokens, segredos, cookies, headers de autenticação, chave do
  Webhook, URLs OAuth com parâmetros sensíveis ou payloads completos de Leads.
- Não inclua nome, empresa, e-mail ou descrição de Leads em logs de observabilidade.
- Preserve o Access Token somente em memória e as validações de entrada.
- Preserve a confirmação explícita para atualizações: `X-Confirm-Update: true`
  na API e `--confirm-update` na CLI.
- Use mocks nos testes. Não execute operações reais no Zoho como parte da
  validação automatizada. Criações e atualizações reais exigem autorização
  explícita do usuário, além dos mecanismos de confirmação da aplicação.
- Não inclua credenciais, `.env`, `.env.n8n`, `.venv`, `.vscode`, `node_modules`
  ou artefatos locais em commits. Não apague arquivos locais do usuário.

## 5. Escopo e implementação

- Faça a menor alteração correta, preservando contratos HTTP, regras de negócio
  e padrões existentes. Não faça refatorações ou limpezas não relacionadas.
- Prefira recursos nativos do Node.js. Justifique qualquer nova dependência.
- Use `apply_patch` para alterações manuais quando a ferramenta estiver disponível.
- Implemente apenas a etapa solicitada; uma especificação completa não autoriza
  avançar automaticamente para todas as etapas.
- A etapa de contexto com `X-Request-ID` já foi implementada e validada nesta
  fase. Preserve o middleware antes do parser JSON, a validação do header, o
  UUID de fallback e o isolamento de requisições concorrentes.
- Logs JSON, redação defensiva e eventos HTTP/Zoho estão implementados conforme
  `docs/STRUCTURED_LOGGING_SPEC.md`. Consulte `docs/OBSERVABILITY.md` para uso e
  limitações; confirme no código o estado antes de iniciar uma nova tarefa.

## 6. Validação e entrega

- Para bugs, identifique a causa e teste a correção. Para features, teste o
  comportamento esperado, incluindo erros e concorrência quando aplicável.
- Execute `npm test` após cada conjunto coerente de mudanças, conforme o handoff.
  Os testes HTTP precisam abrir portas locais; se o sandbox impedir, use o
  mecanismo de autorização da ferramenta e relate a limitação.
- Execute `git diff --check` e revise o diff, incluindo arquivos novos, antes
  de entregar. Confira novamente `git status --short`.
- Não declare testes ou validações manuais que não foram executados. Distinga
  validações do agente daquelas informadas pelo usuário.
- Informe arquivos alterados, decisões técnicas, resultados, limitações e um
  diff resumido. Atualize documentação relevante sem ampliar o escopo.

Para conferir o header com a API já em execução, sem acessar o Zoho:

```bash
curl -i -H 'X-Request-ID: estudo-n8n-001' http://127.0.0.1:3030/health
```

## 7. Infraestrutura, Git e publicação

- Preserve as portas publicadas em `127.0.0.1:3030` e `127.0.0.1:5679`, a rede
  interna, o health check e o volume persistente do n8n.
- Preserve a versão fixada do n8n no Compose; sua atualização é tarefa separada.
- Nunca execute `docker compose down -v` sem autorização explícita.
- Não descarte mudanças, reescreva histórico ou remova dados sem autorização.
- Não faça commit, push ou deploy sem autorização explícita do usuário.
  Antes de um commit autorizado, confira o status e selecione somente arquivos
  relacionados; evite adicionar indiscriminadamente toda a árvore de trabalho.
- Após um deploy autorizado, registre SHA ou release e a validação realizada
  quando aplicável.
