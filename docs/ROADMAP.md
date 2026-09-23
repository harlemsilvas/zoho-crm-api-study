# Roadmap de melhorias

O sistema já está publicado em `zoho.hdevsolucoes.tech`, com API Express,
n8n, Zoho CRM, HTTPS, autenticação de webhook e correlação por `X-Request-ID`.
As próximas mudanças devem preservar o contrato HTTP atual e seguir a ordem de
risco operacional abaixo.

## Prioridade 0 — resiliência da VPS

Objetivo: conseguir recuperar o n8n e detectar indisponibilidade sem intervenção
manual prolongada.

- [x] Automatizar backup do volume `zoho-study-n8n-data`.
- [x] Testar restauração em um volume temporário, sem sobrescrever o volume ativo.
- [x] Confirmar rotação dos logs Docker (`max-size` e `max-file`).
- [x] Criar health check periódico para `3030/health`, `5679/healthz` e HTTPS público.
- [x] Definir retenção de backups e logs, além do procedimento de rollback.

Aceite: um backup novo, uma restauração verificada e um alerta reproduzível de
serviço indisponível.

## Prioridade 1 — segurança de borda

Objetivo: reduzir exposição e facilitar rotação de acesso.

- [x] Documentar rotação da credencial `X-Webhook-Key`.
  A chave antiga foi rejeitada com `403 Forbidden` após a rotação. O valor da
  chave não é armazenado neste repositório.

- [x] Confirmar firewall com somente SSH, HTTP e HTTPS públicos para este projeto.
  A inspeção na VPS confirmou UFW ativo, com entrada permitida para `22/tcp`,
  `80/tcp` e `443/tcp`. As portas da aplicação permanecem restritas ao
  loopback: API em `127.0.0.1:3030` e n8n em `127.0.0.1:5679`. A porta
  `5678/tcp` está negada no UFW; o listener externo nessa porta pertence a
  outro serviço da VPS e está fora deste projeto.

  Comandos de inspeção, sem alteração de regras:

  ```bash
  sudo ufw status verbose
  sudo ufw status numbered
  sudo ss -ltnp | grep -E ':(22|80|443|3030|5678|5679)\b'
  ```

  Não executar `ufw reset` nem adicionar regras antes de registrar o estado
  atual e confirmar uma sessão SSH alternativa.

- [x] Restringir métodos e tamanho de corpo no Nginx quando o workflow não
  precisar de outras opções. O endpoint `GET /webhook/zoho/leads` foi validado
  externamente e retornou `405 Not Allowed`; o limite de corpo permanece em
  `64k` conforme o bloco versionado.

- [x] Avaliar e validar rate limiting no Nginx para o Webhook. A configuração
  usa `30r/m`, `burst=10`, `nodelay` e resposta `429`, aplicada somente ao
  `POST /webhook/zoho/leads`. O teste controlado retornou `12` respostas `403`
  e `33` respostas `429`, sem credencial e sem criar Lead.

- [x] Revisar permissões do usuário `zoho-deploy`, SSH e atualizações do sistema.
  A política SSH foi confirmada em `2026-09-23`: porta `22`,
  `PermitRootLogin no`, autenticação por chave e senha ativas, e autenticação
  interativa desativada. O usuário mantém SSH `700/600`, grupo `docker`, grupo
  `sudo`, `umask 0002` e `unattended-upgrades` ativo. As atualizações Ubuntu
  foram concluídas; a lista de pacotes pendentes ficou vazia. Após a manutenção,
  API, readiness, n8n e HTTPS público retornaram sucesso.

Aceite: chave rotacionada sem editar o código, tentativa sem autenticação
rejeitada e portas internas inacessíveis externamente.

## Prioridade 2 — operação e observabilidade

Objetivo: responder rapidamente a falhas sem registrar dados sensíveis.

- [x] Adicionar e validar na VPS o endpoint `/readiness` separado do `/health`,
  verificando a configuração necessária sem renovar OAuth nem chamar operações
  de Lead. O deploy no SHA `0a18de5` retornou `200` e `zoho_configuration: ok`.
- [x] Definir formato de consulta dos logs por `request_id`, status e evento.
- [x] Monitorar latência e taxa de erro HTTP/Zoho com relatório p95 e contadores.
- [x] Documentar alertas para falhas de token, 5xx e ausência de eventos.
- [x] Validar retenção e acesso aos logs na VPS, sem imprimir eventos.

Aceite: uma falha simulada gera alerta identificável e permite seguir uma
requisição pelo mesmo ID sem expor segredo ou dado pessoal.

## Prioridade 3 — entrega reproduzível

Objetivo: tornar atualizações previsíveis e reversíveis.

- [x] Criar `compose.vps.yaml`, um override versionado para a VPS com `3030` e
  `5679`, sem incluir valores secretos. O override foi validado no host durante
  o deploy `03e78b2`.
- [x] Automatizar `npm test`, `git diff --check` e validação do workflow no CI.
- [x] Registrar versão da imagem, commit implantado e data do deploy na rotina;
  o registro foi criado no deploy `03e78b2` com o override da VPS.
- [x] Definir procedimento de rollback para a imagem e para o workflow n8n,
  usando os registros `latest-deploy` e `previous-deploy`.

Aceite: um deploy de teste reproduz a configuração documentada e um rollback
restaura a versão anterior sem perder o volume do n8n.

## Prioridade 4 — evolução funcional

Objetivo: melhorar o fluxo de Leads sem ampliar risco de criação duplicada.

- [x] Adicionar idempotência para impedir duplicidade em reenvios do n8n. A
  criação aceita `Idempotency-Key` e usa `X-Request-ID` como fallback; um replay
  do mesmo payload devolve `200` com `X-Idempotent-Replay: true`, e uma chave
  reutilizada com payload diferente devolve `409`. O cache é em memória por processo,
  com retenção de 24 horas e limite de 1.000 entradas; reinícios ou múltiplas
  réplicas exigem armazenamento compartilhado antes de escalar a API.
- [x] Padronizar códigos e mensagens de erro entre n8n, API e Zoho.
  Validações locais continuam em `400 VALIDATION_ERROR`; falhas da Zoho são
  expostas como `502` com `ZOHO_AUTH_ERROR`, `ZOHO_RATE_LIMITED` ou
  `ZOHO_API_ERROR`, sem repassar mensagens ou detalhes externos.
- [x] Avaliar paginação e filtros de listagem. `GET /api/leads` aceita
  `page` (1–200), `per_page` (1–200) e filtro exato `company`; o filtro é
  convertido para `criteria` na API V8 da Zoho e valores inválidos são
  rejeitados com `400 VALIDATION_ERROR`.
- [x] Criar fluxo explícito e protegido para atualização de Lead. A rota
  `PATCH /api/leads/:id` exige `X-Confirm-Update: true` antes de validar ou
  chamar a Zoho; sem o cabeçalho retorna `400 VALIDATION_ERROR`. O cliente
  continua exigindo a confirmação explícita como segunda barreira.
- [x] Adicionar testes de contrato do workflow para cada resposta pública. Os
  testes cobrem validação `400`, sucesso com status da API, erro da API,
  propagação de `X-Request-ID`, resposta JSON completa e conexões dos caminhos.

Aceite: reenvio da mesma execução não cria duplicidade e os contratos existentes
continuam aprovados.

## Próxima sessão

As Prioridades 0 a 4 foram concluídas e validadas. Próximas evoluções devem
ser escolhidas conforme o risco e começar por uma mudança pequena:

1. Avaliar armazenamento compartilhado para idempotência antes de usar múltiplas
   réplicas da API.
2. Avaliar um workflow n8n separado para atualização de Lead, mantendo a dupla
   confirmação da API.
3. Manter o ciclo de backup, health check, testes e deploy reproduzível.

Cada etapa deve ser pequena, testada e commitada separadamente. Não executar
alterações destrutivas na VPS sem backup e sem um rollback definido.
