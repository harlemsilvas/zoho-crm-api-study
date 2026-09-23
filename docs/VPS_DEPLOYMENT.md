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
curl -fsS http://127.0.0.1:5679/healthz >/dev/null
curl -fsSI https://zoho.hdevsolucoes.tech/healthz >/dev/null
echo "health checks: ok"
```

Não execute `docker compose down -v`. O volume `zoho-study-n8n-data` contém o
estado do n8n e precisa de backup antes de mudanças relevantes.

## Segurança operacional

- Não abrir `3030`, `5678` ou `5679` no firewall.
- Liberar externamente apenas SSH, HTTP e HTTPS conforme a política da VPS.
- Manter `.env` e `.env.n8n` com modo `600`.
- Não imprimir tokens, credenciais, payloads ou valores do Header Auth.
- Rotacionar `X-Webhook-Key` se houver suspeita de exposição.
- Fazer backup e testar restauração do volume antes de upgrades do n8n.
- O último backup restaurado com sucesso deve ser mantido fora do host quando a
  política de continuidade exigir proteção contra perda da VPS.
