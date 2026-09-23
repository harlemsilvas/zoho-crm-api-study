# Aplicação em produção — `zoho.hdevsolucoes.tech`

Este documento registra a instalação operacional da aplicação na VPS. Segredos
ficam somente nos arquivos locais da VPS e nas credenciais criptografadas do
n8n; não fazem parte deste repositório.

## Arquitetura

```text
Internet → HTTPS :443 → Nginx
                       → 127.0.0.1:5679 → n8n :5678
                       → API interna zoho-api:3000
                         host da API: 127.0.0.1:3030
```

O Nginx é o único ponto público. A API e a porta do host do n8n ficam presas a
loopback. O Docker usa a rede interna entre os containers.

## Portas e firewall

A exposição deste projeto é a seguinte:

| Serviço | Endereço no host | Destino | Exposição |
| --- | --- | --- | --- |
| API | `127.0.0.1:3030` | `zoho-api:3000` | somente local |
| n8n | `127.0.0.1:5679` | `n8n:5678` | somente local |
| Nginx HTTP | `0.0.0.0:80` | redirecionamento/proxy | público |
| Nginx HTTPS | `0.0.0.0:443` | proxy para o n8n | público |

A validação do UFW confirmou entrada permitida para SSH (`22/tcp`), HTTP
(`80/tcp`) e HTTPS (`443/tcp`) usados pela operação deste projeto. A porta
`5678/tcp` está negada no firewall. O listener externo em `0.0.0.0:5678`
pertence ao container `socialbot_n8n`, outro serviço da VPS; ele não faz parte
desta aplicação. A API e o n8n deste projeto permanecem vinculados a
`127.0.0.1`.

Comandos de inspeção, sem alteração de regras:

```bash
sudo ufw status verbose
sudo ufw status numbered
sudo ss -ltnp | grep -E ':(22|80|443|3030|5678|5679)\b'
```

Não abrir `3030`, `5678` ou `5679` externamente. Mudanças no firewall exigem
registrar o estado atual e manter uma sessão SSH alternativa aberta.

## Restrição do webhook no Nginx

A interface e a API do n8n continuam usando os métodos necessários. A restrição
é aplicada somente a `POST /webhook/zoho/leads`:

- métodos diferentes de `POST` retornam `405 Method Not Allowed`;
- corpos acima de `64k` retornam `413 Request Entity Too Large`;
- o `X-Request-ID` recebido é encaminhado ao n8n para preservar a correlação.

O bloco versionado em
[`ops/nginx/zoho-webhook-location.conf.example`](../ops/nginx/zoho-webhook-location.conf.example)
deve ser inserido no `server` HTTPS, antes do `location /` geral. Na VPS:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Validação sem criar Lead:

```bash
curl -k -i -X GET https://zoho.hdevsolucoes.tech/webhook/zoho/leads
curl -k -i -X POST https://zoho.hdevsolucoes.tech/webhook/zoho/leads \
  -H 'Content-Type: application/json' \
  -d '{}'
```

A validação na VPS confirmou `200` para `/healthz` e `405 Not Allowed` para
um método não permitido no webhook, sem aplicar o limite às rotas normais. O
POST sem credencial deve alcançar o workflow e retornar a validação de
autenticação prevista, sem criar Lead. Não enviar a chave do webhook ou dados
reais durante esse teste.

## Rate limiting do webhook

A avaliação recomenda limitar somente `POST /webhook/zoho/leads` por endereço IP,
sem usar `X-Forwarded-For` como chave. A configuração proposta é `30r/m` com
`burst=10` e `nodelay`: permite um pico curto de até dez requisições e depois
reduz a taxa sustentada, retornando `429 Too Many Requests` quando o limite é
excedido. O valor deve ser revisto se o n8n passar a processar lotes maiores ou
usar retries mais frequentes.

O arquivo
[`ops/nginx/zoho-webhook-rate-limit-http.conf.example`](../ops/nginx/zoho-webhook-rate-limit-http.conf.example)
deve ser incluído uma única vez no contexto `http {}` do Nginx. A diretiva
`limit_req` correspondente já está no bloco da rota em
[`ops/nginx/zoho-webhook-location.conf.example`](../ops/nginx/zoho-webhook-location.conf.example).
Após copiar os dois blocos para a VPS:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Validação controlada, sem credencial e sem criar Lead:

```bash
for i in $(seq 1 45); do
  curl -ksS -o /dev/null -w '%{http_code}\n' \
    -X POST https://zoho.hdevsolucoes.tech/webhook/zoho/leads \
    -H 'Content-Type: application/json' \
    -d '{}'
done | sort | uniq -c
```

Na validação executada, o teste retornou `12` respostas `403` do n8n e `33`
respostas `429` do Nginx, confirmando o bloqueio após o burst. O teste não
enviou `X-Webhook-Key` e não criou Lead. Revise os valores se o volume real
de retries ou lotes do n8n mudar.

## Auditoria do usuário de deploy

Auditoria remota executada como `zoho-deploy`, sem shell root e sem ler valores
de ambiente:

- grupo `docker` presente; `docker ps` funcionou para o usuário;
- `~/.ssh` com modo `700` e `authorized_keys` com modo `600`, ambos pertencentes
a `zoho-deploy`;
- `.env` e `.env.n8n` com modo `600`, sem leitura de conteúdo;
- o usuário também pertence ao grupo `sudo` e pode usar regras administrativas
  mediante autenticação. A listagem `sudo -n -l` confirmou ainda o wrapper
  `clpctlWrapper` sem senha;
- `unattended-upgrades` está ativo, mas há pacotes Ubuntu atualizáveis;
- o repositório na VPS está na branch `feat/structured-logs` e possui uma
  alteração local em `compose.n8n.yaml`, que deve ser preservada antes de
  qualquer atualização ou pull;
- a configuração efetiva do `sshd` não foi alterada nem validada com root nesta
  auditoria. Revisá-la exige uma sessão administrativa planejada.

Não aplicar `apt upgrade`, alterar grupos, permissões ou configuração SSH junto
com um deploy da aplicação. Fazer backup e manter uma segunda sessão SSH antes
de qualquer mudança administrativa.

## Publicação repetível

A rotina [`ops/publish-vps.sh`](../ops/publish-vps.sh) executa os testes locais,
publica somente quando recebe `--push` e atualiza a VPS somente quando recebe
`--deploy`. Ela exige a branch `feat/structured-logs`, executa `git diff --check`,
recusa alterações rastreadas locais e interrompe o processo se a VPS estiver
com mudanças não commitadas. Nunca executa `docker compose down -v` e não exibe
valores de `.env` ou `.env.n8n`.

Uso:

```bash
VPS_HOST=187.77.61.83 ./ops/publish-vps.sh --push --deploy
```

Se a VPS possuir uma alteração local em `compose.n8n.yaml`, a rotina irá parar
antes do push ou pull até essa alteração ser preservada ou incorporada a uma
configuração versionada. Isso evita sobrescrever o mapeamento local de portas.

## Último deploy validado

A rotina de publicação implantou o SHA `0a18de5` na branch
`feat/structured-logs`. A validação remota confirmou:

- API saudável em `127.0.0.1:3030`;
- `/readiness` retornando `200` com `zoho_configuration: ok`;
- n8n saudável em `127.0.0.1:5679`;
- HTTPS público retornando `200` em `/healthz`;
- working tree remoto limpo.

## Instalação registrada

- Usuário: `zoho-deploy`, com SSH por chave e grupo `docker`.
- Node.js `20.20.2` e npm `11.18.0`.
- Domínio: `zoho.hdevsolucoes.tech`.
- Proxy: Nginx com certificado Let's Encrypt.
- API: `127.0.0.1:3030` no host e `3000` no container.
- n8n: `127.0.0.1:5679` no host e `5678` no container.
- Workflow: `Zoho CRM — Criar Lead via Webhook`.
- Autenticação: Header Auth com `X-Webhook-Key`, configurada no n8n.
- Backup do volume `zoho-study-n8n-data` criado e restauração validada em volume
  temporário, sem alterar o ambiente ativo.

## Validação executada

```bash
node -v
npm -v
npm test
curl -I https://zoho.hdevsolucoes.tech/healthz
```

A suíte retornou 53 testes aprovados. Também foi executada uma criação
controlada de Lead fictício pelo domínio público, com resposta `201`. O mesmo
`X-Request-ID` apareceu nos eventos `zoho_operation_succeeded` e
`http_request_completed`.

## Operação diária

```bash
cd ~/zoho-crm-api-study
docker compose --env-file .env.n8n -f compose.n8n.yaml ps
curl -fsS http://127.0.0.1:3030/health
curl -fsS http://127.0.0.1:3030/readiness
curl -fsS http://127.0.0.1:5679/healthz
docker logs --since 10m zoho-study-api
```

Verifique a política de rotação aplicada aos containers:

```bash
docker inspect --format '{{.Name}} {{.HostConfig.LogConfig.Type}} {{json .HostConfig.LogConfig.Config}}' \
  zoho-study-api zoho-study-n8n
```

O resultado esperado inclui `json-file`, `max-size: 10m` e `max-file: 5`.

Checagem rápida dos serviços e do domínio:

```bash
set -eu
curl -fsS http://127.0.0.1:3030/health >/dev/null
curl -fsS http://127.0.0.1:3030/readiness >/dev/null
curl -fsS http://127.0.0.1:5679/healthz >/dev/null
curl -fsSI https://zoho.hdevsolucoes.tech/healthz >/dev/null
echo "health checks: ok"
```

## Health check periódico

O script `ops/zoho-healthcheck.sh` verifica a API em `3030`, o n8n em `5679` e
o HTTPS público. Para instalar o timer na VPS:

```bash
sudo install -m 755 ops/zoho-healthcheck.sh \
  /home/zoho-deploy/zoho-crm-api-study/ops/zoho-healthcheck.sh
sudo install -m 644 ops/systemd/zoho-healthcheck.service \
  /etc/systemd/system/zoho-healthcheck.service
sudo install -m 644 ops/systemd/zoho-healthcheck.timer \
  /etc/systemd/system/zoho-healthcheck.timer
sudo systemctl daemon-reload
sudo systemctl enable --now zoho-healthcheck.timer
```

Validar imediatamente e conferir o agendamento:

```bash
systemctl start zoho-healthcheck.service
systemctl status zoho-healthcheck.service --no-pager
systemctl list-timers zoho-healthcheck.timer
journalctl -u zoho-healthcheck.service -n 20 --no-pager
```

O serviço falha se qualquer endpoint não responder com sucesso. O timer executa
dois minutos após o boot e depois a cada cinco minutos.

Não execute `docker compose down -v`. O volume `zoho-study-n8n-data` contém o
estado do n8n e precisa de backup antes de mudanças relevantes.

Consulte [Operations Policy](OPERATIONS_POLICY.md) para retenção de backups,
limites de logs e rollback de código ou workflow.

## Segurança operacional

- Não abrir `3030`, `5678` ou `5679` no firewall.
- Liberar externamente apenas SSH, HTTP e HTTPS conforme a política da VPS.
- Manter `.env` e `.env.n8n` com modo `600`.
- Não imprimir tokens, credenciais, payloads ou valores do Header Auth.
- Rotacionar `X-Webhook-Key` se houver suspeita de exposição.
- Fazer backup e testar restauração do volume antes de upgrades do n8n.
- O último backup restaurado com sucesso deve ser mantido fora do host quando a
  política de continuidade exigir proteção contra perda da VPS.
