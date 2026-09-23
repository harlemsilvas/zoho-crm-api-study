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

- [ ] Revisar permissões do usuário `zoho-deploy`, SSH e atualizações do sistema.
  A auditoria sem root confirmou SSH `700/600`, acesso ao Docker e `.env*`
  `600`; ainda faltam aplicar/registrar a política final de autenticação e
  tratar as atualizações Ubuntu pendentes.

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

- Criar um override Compose versionado para a VPS, com `3030` e `5679`, sem
  incluir valores secretos.
- Automatizar `npm test`, `git diff --check` e validação do workflow no CI.
- Registrar versão da imagem, commit implantado e data do deploy.
- Definir procedimento de rollback para a imagem e para o workflow n8n.

Aceite: um deploy de teste reproduz a configuração documentada e um rollback
restaura a versão anterior sem perder o volume do n8n.

## Prioridade 4 — evolução funcional

Objetivo: melhorar o fluxo de Leads sem ampliar risco de criação duplicada.

- Adicionar idempotência para impedir duplicidade em reenvios do n8n.
- Padronizar códigos e mensagens de erro entre n8n, API e Zoho.
- Avaliar paginação e filtros de listagem.
- Criar fluxo explícito e protegido para atualização de Lead.
- Adicionar testes de contrato do workflow para cada resposta pública.

Aceite: reenvio da mesma execução não cria duplicidade e os contratos existentes
continuam aprovados.

## Ordem para a próxima sessão

1. Fazer backup e testar restauração em volume temporário.
2. Confirmar rotação de logs e saúde dos serviços.
3. Criar monitoramento simples com retenção definida.
4. Versionar o override Compose da VPS.
5. Só então iniciar idempotência e novas operações de Leads.

Cada etapa deve ser pequena, testada e commitada separadamente. Não executar
alterações destrutivas na VPS sem backup e sem um rollback definido.
