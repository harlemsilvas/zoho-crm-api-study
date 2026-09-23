# Logs estruturados e correlação

Implementação baseada em `PROXIMO.md` e `STRUCTURED_LOGGING_SPEC.md`, usando
somente recursos nativos do Node.js. A validação automatizada usa mocks; não
acessa o Zoho nem depende dos arquivos de credenciais.

## Estado desta fase

- Contexto com `AsyncLocalStorage` e resposta `X-Request-ID` implementados.
- Logger JSON com redação recursiva e destino de escrita injetável implementado.
- Eventos HTTP, operações Zoho e renovação OAuth correlacionados implementados.
- Eventos de inicialização e encerramento do servidor também usam JSON.
- Implantação na VPS e mudanças no workflow ativo do n8n não fazem parte desta entrega.

## Readiness

`GET /health` confirma apenas que o processo HTTP está respondendo. `GET
/readiness` retorna `200` quando o cliente Zoho recebeu toda a configuração
normalizada necessária no processo; sem essa configuração, retorna `503` com
`status: "not_ready"`. O endpoint não renova OAuth, não chama a Zoho e não
expõe valores de configuração.

Validação local:

```bash
curl -i http://127.0.0.1:3030/health
curl -i http://127.0.0.1:3030/readiness
```

## Formato e eventos

Cada evento ocupa uma linha JSON em stdout, terminada por uma quebra de linha:

```json
{"timestamp":"2026-09-22T14:30:00.000Z","level":"info","event":"http_request_completed","request_id":"estudo-n8n-001","method":"GET","path":"/health","status":200,"duration_ms":1.42}
```

O logger adiciona timestamp UTC, nível, evento e o ID do contexto, quando existir.
Metadados não podem sobrescrever esses campos. Eventos fora de uma requisição,
como a inicialização do servidor, não têm `request_id`.

| Eventos | Quando são emitidos |
| --- | --- |
| `http_request_completed` | Na conclusão da resposta, inclusive 400, 404 e 500 |
| `http_request_failed` | Além da conclusão, quando o handler responde erro interno |
| `zoho_operation_started` / `succeeded` / `failed` | Ao executar uma chamada Zoho de Leads |
| `zoho_token_refresh_started` / `succeeded` / `failed` | Ao renovar o Access Token |
| `server_started` / `stopping` / `stopped` / `shutdown_failed` | No ciclo de vida do servidor |

Os sufixos Zoho e servidor completam o prefixo da primeira coluna. Por exemplo,
o evento de sucesso de operação é `zoho_operation_succeeded`.

Operações: `list_leads`, `get_lead`, `create_lead` e `update_lead`.
A validação local ocorre antes da chamada Zoho; uma entrada rejeitada sem chamada
externa gera o evento HTTP, sem inventar uma operação externa.

`duration_ms` usa relógio monotônico. A duração de uma operação inclui eventual
renovação OAuth; a renovação também tem sua própria duração. O status dos eventos
Zoho é o HTTP externo, enquanto o evento HTTP contém o status respondido pela API.
Quando não houve resposta externa, o status externo é omitido. Falhas de negócio
em respostas Zoho 2xx são registradas como falha, preservando o contrato existente.

Conclusões HTTP usam `info` para status abaixo de 400, `warn` para 4xx e `error`
para 5xx. Falhas Zoho usam `error`. Respostas interrompidas antes de `finish` ainda
não têm evento específico de cancelamento.

## Proteção dos dados

Os pontos de instrumentação selecionam apenas metadados operacionais. Não passam
headers, bodies, URLs externas, payloads, mensagens de erro, stacks ou dados
pessoais para o logger. IDs de registros também não são registrados.

As rotas HTTP são normalizadas como `/health`, `/readiness`, `/api/leads` e `/api/leads/:id`.
Caminhos desconhecidos aparecem como `[unmatched]`. Query strings e valores dos
parâmetros de rota nunca entram no log.

O logger oferece uma segunda camada: substitui chaves sensíveis por `[REDACTED]`,
recursivamente, inclusive em arrays, sem alterar o objeto recebido. A comparação
ignora maiúsculas, hífens e sublinhados, cobrindo também nomes como `clientSecret`.
Objetos `Error` são reduzidos a um nome de classe permitido; não incluem mensagem,
stack, causa ou propriedades personalizadas. Códigos Zoho só são registrados se
estiverem na lista explícita de códigos conhecidos do cliente.

Referências circulares viram `[Circular]`; estruturas além de 32 níveis viram
`[Truncated]`. Falhas síncronas de serialização ou escrita são contidas, sem
imprimir o objeto original ou alterar a operação. Isso pode perder eventos se o
destino falhar; não há fila persistente nem garantia de entrega dos logs.

A redação por chave não detecta segredos escondidos em qualquer texto arbitrário.
Ao adicionar eventos, mantenha a seleção explícita de metadados e use nomes de
evento fixos. Use IDs de correlação opacos, nunca nomes, e-mails ou credenciais.
Essas proteções são dos logs da API; não alteram dados salvos nas execuções do n8n.

## Captura em testes

```js
const captured = [];
const logger = createLogger({ write: line => captured.push(line) });
const crmClient = new ZohoCrmClient(configDeTeste, fetchMock, { logger });
const app = createApp({ crmClient, logger });
```

O destino injetado é uma função síncrona. As assinaturas anteriores de `createApp`
e `ZohoCrmClient(config, fetchMock)` continuam funcionando com o logger padrão.

Execute `npm test`. A suíte cobre serialização, redação, erros, status e duração,
concorrência e correlação HTTP → OAuth → Zoho usando respostas simuladas.

## Validação local sem criar Leads

Com a API atualizada e já em execução, rode:

```bash
curl -i -H 'X-Request-ID: estudo-n8n-001' http://127.0.0.1:3030/health
curl -i -H 'X-Request-ID: estudo-n8n-002' 'http://127.0.0.1:3030/api/leads?per_page=abc'
curl -i -H 'X-Request-ID: estudo-n8n-003' http://127.0.0.1:3030/rota-inexistente
```

Confirme os status 200, 400 e 404, respectivamente, o header de resposta e uma
linha `http_request_completed` com o mesmo ID, status e duração. Essas três
chamadas não consultam nem modificam o Zoho. Sem header, a API gera um UUID;
um valor inválido também é substituído. São aceitos IDs de até 128 caracteres
alfanuméricos, hífen, ponto e sublinhado, após remover espaços das extremidades.

Para uma API já executando no container, acompanhe os logs com:

```bash
docker logs --since 5m -f zoho-study-api
```

O container precisa ter sido reconstruído com o código desta fase para emitir
os novos eventos. Não confunda logs antigos com a versão atual.

## Acompanhamento no n8n e próximos passos

O workflow exportado já configura o nó **Criar Lead na API** para retornar a
resposta completa. Na saída desse nó, `headers["x-request-id"]` contém o ID
retornado pela API. Procure esse valor em `request_id` nos logs para acompanhar
a operação e eventual renovação OAuth.

O workflow exportado envia `$execution.id` no header `X-Request-ID` do nó **Criar
Lead na API**. Os três nós **Responder** devolvem o ID recebido da API (ou o ID
da execução no caminho de validação) no header `X-Request-ID`. Assim, a execução
do n8n e os logs da API podem ser localizados pelo mesmo valor. Essa alteração foi
feita no arquivo exportado e deve ser importada/validada no n8n antes de substituir
o workflow ativo.

O ID correlaciona os eventos da API sobre o Zoho; não representa suporte a tracing
nos servidores da Zoho nem é enviado como header adicional para eles.

Sequência recomendada antes da VPS:

1. Validar os logs locais pelos comandos acima.
2. Conferir uma execução controlada do n8n e localizar seu ID nos logs. Uma criação
   real de Lead exige autorização; os testes automatizados desta entrega usam mocks.
3. Revisar o diff e autorizar separadamente commit e push.
4. Planejar a implantação e a retenção/acesso aos logs na VPS em uma tarefa própria.
