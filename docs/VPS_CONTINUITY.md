# Continuidade — implantação na VPS

A integração local foi validada com 53 testes e uma criação controlada via
`n8n → API Express → Zoho CRM`. Este documento orienta a sessão de implantação.

## Decisões

- Domínio: `zoho.hdevsolucoes.tech`.
- API privada: `127.0.0.1:3000`.
- n8n interno: container `5678`, host `127.0.0.1:5679` para evitar conflito.
- Proxy HTTPS externo: portas `80/443` para `127.0.0.1:5679`.
- Não publicar `3000`, `5678` ou `5679` no firewall.
- Não copiar, exibir ou commitar `.env` e `.env.n8n`.

Mapeamento planejado na VPS:

```yaml
zoho-api:
  ports:
    - "127.0.0.1:3000:3000"
n8n:
  ports:
    - "127.0.0.1:5679:5678"
```

## Cronograma

1. Criar DNS `A` para `zoho.hdevsolucoes.tech` apontando ao IP público e testar
   `dig +short zoho.hdevsolucoes.tech`.
2. Criar usuário operacional e conceder Docker:

```bash
sudo adduser deploy
sudo usermod -aG sudo deploy
sudo usermod -aG docker deploy
```

Instalar a chave SSH em `/home/deploy/.ssh/authorized_keys` (`700` no diretório,
`600` no arquivo) e validar um novo login. O grupo `docker` equivale a acesso
administrativo; conceder somente ao operador autorizado.

3. Como `deploy`, instalar/validar Docker, clonar o repositório e selecionar a
   branch:

```bash
docker version
docker compose version
git clone URL_DO_REPOSITORIO zoho-crm-api-study
cd zoho-crm-api-study
git switch feat/structured-logs
git status --short
```

4. Criar `.env` e `.env.n8n` diretamente na VPS, sem colocá-los no Git, e usar:

```bash
chmod 600 .env .env.n8n
test -s .env
test -s .env.n8n
```

Não executar comandos que exibam os valores.

5. Alterar somente o mapeamento do n8n para `127.0.0.1:5679:5678` e subir:

```bash
docker compose --env-file .env.n8n -f compose.n8n.yaml up -d --build
docker compose --env-file .env.n8n -f compose.n8n.yaml ps
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:5679/healthz
```

Nunca usar `docker compose down -v`.

6. Configurar o proxy, por exemplo no Caddy:

```text
zoho.hdevsolucoes.tech {
    reverse_proxy 127.0.0.1:5679
}
```

Abrir no firewall somente `22`, `80` e `443`.

7. Importar `n8n/workflows/zoho-create-lead.json`, selecionar a credencial
   Header Auth `X-Webhook-Key` e ativar. Testar primeiro sem criar Lead:

```bash
curl -i https://zoho.hdevsolucoes.tech/healthz
curl -i -X POST https://zoho.hdevsolucoes.tech/webhook/zoho/leads \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Depois fazer uma única criação com dados fictícios e confirmar `201`,
`X-Request-ID` e o mesmo ID nos logs HTTP/Zoho.

8. Configurar rotação/retenção de logs e backup do volume n8n:

```bash
docker logs --since 10m zoho-study-api
docker logs --since 10m zoho-study-n8n
```

## Critérios de aceite

- DNS e HTTPS funcionam para o domínio.
- n8n é acessível somente pelo proxy; API permanece em loopback.
- Volume persiste após reinício.
- Workflow propaga `X-Request-ID`.
- Uma execução controlada retorna `201` e correlaciona os logs.
- Nenhum segredo aparece em Git, logs ou documentação.

## Encerramento

```bash
npm test
git diff --check
git status --short
```

Fazer commit somente dos arquivos relacionados; excluir `.vscode`, `.env` e
`.env.n8n`. Não fazer push sem autorização.
