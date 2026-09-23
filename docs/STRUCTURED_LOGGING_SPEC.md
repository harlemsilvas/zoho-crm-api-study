# Especificação — Logs estruturados e correlação de requisições

## Objetivo

Adicionar observabilidade à API Express para acompanhar cada operação entre n8n, API e Zoho CRM sem registrar credenciais ou dados pessoais.

## Escopo

### Incluído

- geração e propagação de `request_id`;
- suporte ao header de entrada `X-Request-ID`;
- geração segura de um UUID quando o header não for aceito;
- retorno do `X-Request-ID` na resposta;
- logs JSON em uma linha;
- medição da duração das requisições;
- logs de início, sucesso e erro das operações do cliente Zoho;
- redação defensiva de campos sensíveis;
- testes automatizados;
- documentação de uso.

### Fora do escopo

- Elasticsearch, Loki, Grafana ou Datadog;
- persistência de logs em banco;
- OpenTelemetry completo;
- tracing distribuído com collector;
- alteração das regras de negócio dos Leads;
- implantação na VPS;
- alteração das credenciais OAuth.

## Estrutura proposta

```text
src/
└── observability/
    ├── logger.js
    └── requestContext.js

test/
├── logger.test.js
└── requestContext.test.js
```

A estrutura final deve respeitar a arquitetura real encontrada no repositório. Não crie arquivos redundantes se já existir uma abstração equivalente.

## Contexto da requisição

Utilizar preferencialmente recursos nativos:

```js
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
```

O contexto deve permitir recuperar o `request_id` sem passá-lo manualmente por todas as funções.

### Header aceito

```http
X-Request-ID
```

### Regras de validação

- aceitar apenas uma string simples;
- remover espaços nas extremidades;
- limitar o tamanho, por exemplo, a 128 caracteres;
- aceitar caracteres alfanuméricos, hífen, ponto e sublinhado;
- gerar UUID quando ausente ou inválido;
- nunca refletir valores com quebras de linha.

### Resposta

Todas as respostas devem conter:

```http
X-Request-ID: <identificador>
```

Isso inclui respostas de sucesso, validação, rota inexistente e erro interno.

## Formato dos logs

Cada evento deve ocupar uma única linha JSON válida.

Exemplo:

```json
{"timestamp":"2026-09-22T14:30:00.000Z","level":"info","event":"http_request_completed","request_id":"550e8400-e29b-41d4-a716-446655440000","method":"POST","path":"/api/leads","status":201,"duration_ms":842}
```

Campos básicos:

- `timestamp`;
- `level`;
- `event`;
- `request_id`, quando houver contexto;
- metadados estritamente necessários ao evento.

Níveis mínimos:

- `info`;
- `warn`;
- `error`.

## Eventos HTTP

### Conclusão

```text
http_request_completed
```

Campos permitidos:

- `request_id`;
- `method`;
- `path` sem query string sensível;
- `status`;
- `duration_ms`.

### Falha não tratada

```text
http_request_failed
```

Campos permitidos:

- `request_id`;
- `method`;
- `path`;
- `status`;
- `duration_ms`;
- `error_name`;
- código interno seguro, quando existir.

Não registrar stack trace em produção por padrão. Durante testes, o logger pode receber um destino injetado.

## Eventos do cliente Zoho

Usar nomes consistentes, por exemplo:

```text
zoho_token_refresh_started
zoho_token_refresh_succeeded
zoho_token_refresh_failed
zoho_operation_started
zoho_operation_succeeded
zoho_operation_failed
```

Campos permitidos:

- `request_id`;
- operação: `list_leads`, `get_lead`, `create_lead` ou `update_lead`;
- status HTTP externo;
- duração;
- código de erro seguro retornado pela Zoho;
- ID do registro somente quando já fizer parte da resposta pública atual e houver necessidade operacional.

Nunca registrar:

- URL completa contendo parâmetros OAuth;
- headers;
- `Authorization`;
- `access_token`;
- `refresh_token`;
- `client_secret`;
- `client_id`;
- cookies;
- chave do Webhook;
- payload completo;
- nome, empresa, e-mail ou descrição do Lead.

## Redação defensiva

O logger deve remover recursivamente chaves sensíveis, sem diferenciar maiúsculas e minúsculas.

Lista mínima:

```text
authorization
cookie
set-cookie
access_token
refresh_token
client_secret
client_id
password
secret
token
x-webhook-key
```

Valor substituto recomendado:

```text
[REDACTED]
```

O logger não deve lançar erro ao receber:

- `undefined`;
- `null`;
- arrays;
- objetos aninhados;
- instâncias de `Error`;
- referências circulares.

## Injeção e testabilidade

Evitar acoplamento rígido a `console`. O logger pode aceitar uma função de escrita ou stream para que testes capturem a saída sem poluir o terminal.

Exemplo conceitual:

```js
const logger = createLogger({ write: line => captured.push(line) });
```

Não é obrigatório seguir essa assinatura se a arquitetura existente indicar uma alternativa mais simples.

## Testes mínimos

### Contexto

- gera UUID sem header;
- preserva um `X-Request-ID` válido;
- rejeita valor com quebra de linha;
- rejeita valor acima do limite;
- mantém contextos isolados em requisições concorrentes;
- disponibiliza o ID durante operações assíncronas.

### Logger

- produz JSON válido em uma única linha;
- inclui timestamp, nível e evento;
- inclui o `request_id` do contexto;
- remove campos sensíveis no primeiro nível;
- remove campos sensíveis aninhados;
- não altera o objeto original;
- serializa erros de forma segura;
- não falha com referência circular.

### API

- devolve `X-Request-ID` fornecido e válido;
- gera `X-Request-ID` quando ausente;
- substitui `X-Request-ID` inválido;
- preserva correlação em resposta `404`;
- preserva correlação em resposta `400`;
- registra status e duração ao terminar;
- não modifica os contratos JSON existentes.

### Cliente Zoho

- registra operação sem Authorization;
- registra falha sem corpo sensível;
- não imprime Access Token durante renovação;
- mantém os mocks atuais funcionando.

## Sequência de implementação

1. Executar diagnóstico e suíte atual.
2. Criar `requestContext.js`.
3. Criar testes unitários do contexto.
4. Criar `logger.js` com redação defensiva.
5. Criar testes unitários do logger.
6. Integrar middleware no início de `createApp`.
7. Adicionar testes HTTP do `X-Request-ID`.
8. Integrar eventos seguros ao cliente Zoho.
9. Testar concorrência e ausência de segredos.
10. Executar a suíte completa.
11. Executar `git diff --check`.
12. Mostrar o diff e os resultados ao usuário antes de qualquer commit.

## Critérios de aceite

- todas as requisições retornam `X-Request-ID`;
- logs são JSON válido, uma linha por evento;
- o mesmo ID aparece nos eventos HTTP e Zoho da mesma operação;
- requisições concorrentes não misturam IDs;
- nenhum segredo aparece nos testes de captura;
- contratos HTTP existentes permanecem inalterados;
- todos os testes anteriores continuam aprovados;
- novos testes cobrem contexto, logger e middleware;
- nenhuma dependência nova é necessária, salvo justificativa explícita;
- `.env` e `.env.n8n` continuam fora do Git.

## Validação manual sugerida

Executar a API e chamar:

```bash
curl -i \
  -H 'X-Request-ID: estudo-n8n-001' \
  'http://127.0.0.1:3030/api/leads?per_page=1'
```

Confirmar:

- header de resposta `X-Request-ID: estudo-n8n-001`;
- log de conclusão em JSON;
- mesmo `request_id` nos eventos relacionados;
- ausência de tokens, e-mails e payloads.

## Entrega esperada do Codex

Ao terminar, apresentar:

- arquivos criados e alterados;
- decisões técnicas;
- testes executados e resultados;
- riscos ou limitações restantes;
- comandos de validação manual;
- diff resumido;
- sugestão de commit, sem executá-lo automaticamente.

