# Continuação — próxima sessão

## Estado ao encerrar

- Branch: `feat/structured-logs`.
- Commit publicado: `289be33` (`feat: evoluir contratos funcionais de Leads`).
- Deploy validado na VPS no mesmo commit.
- Domínio público: `https://zoho.hdevsolucoes.tech`.
- API: `127.0.0.1:3030`; readiness retornando `200`.
- n8n: `127.0.0.1:5679`; `/healthz` retornando `200`.
- HTTPS público: `/healthz` retornando `200`.
- n8n fixado na versão `2.38.6`.
- SSH revisado: porta `22`, `PermitRootLogin no`, chave e senha ativas,
  autenticação interativa desativada.
- Atualizações Ubuntu concluídas; `apt list --upgradable` sem resultados.
- Prioridades 0, 1, 2, 3 e 4 marcadas como concluídas no roadmap.

Não há credenciais, tokens ou valores de `.env` neste documento.

## Verificação inicial

Na próxima sessão, começar no diretório do projeto com:

```bash
git switch feat/structured-logs
git status --short
npm test
npm run validate:workflow
git diff --check
```

Preservar os arquivos locais não rastreados e não adicionar `.env`, `.env.n8n`, `.vscode` ou chaves ao commit.

## Próximas opções

1. A avaliação da store compartilhada está registrada em [Idempotência](IDEMPOTENCY.md).
   A decisão é manter o cache em memória enquanto houver uma réplica e migrar
   para Valkey/Redis antes de escalar horizontalmente.
2. O workflow n8n separado de atualização já foi criado em
   `n8n/workflows/zoho-update-lead.json`. Ele usa o caminho
   `/webhook/zoho/leads/update`, valida o ID e envia
   `X-Confirm-Update: true` somente à API interna.
3. Continuar o ciclo operacional: backup do volume, health check, testes,
   `git diff --check`, commit seletivo e deploy pela rotina versionada.

## Publicação

A rotina autorizada de publicação permanece:

```bash
VPS_HOST=187.77.61.83 ./ops/publish-vps.sh --push --deploy
```

Usar somente após revisão do diff e confirmação de que não há alterações
locais rastreadas. Não executar `docker compose down -v`.
