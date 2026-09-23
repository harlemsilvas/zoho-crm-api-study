# Roadmap de melhorias

O sistema já está publicado em `zoho.hdevsolucoes.tech`, com API Express,
n8n, Zoho CRM, HTTPS, autenticação de webhook e correlação por `X-Request-ID`.
As próximas mudanças devem preservar o contrato HTTP atual e seguir a ordem de
risco operacional abaixo.

## Prioridade 0 — resiliência da VPS

Objetivo: conseguir recuperar o n8n e detectar indisponibilidade sem intervenção
manual prolongada.

- Automatizar backup do volume `zoho-study-n8n-data`.
- Testar restauração em um volume temporário, sem sobrescrever o volume ativo.
- Confirmar rotação dos logs Docker (`max-size` e `max-file`).
- Criar health check periódico para `3030/health`, `5679/healthz` e HTTPS público.
- Definir retenção de backups e logs, além do procedimento de rollback.

Aceite: um backup novo, uma restauração verificada e um alerta reproduzível de
serviço indisponível.

## Prioridade 1 — segurança de borda

Objetivo: reduzir exposição e facilitar rotação de acesso.

- Documentar rotação da credencial `X-Webhook-Key`.
- Confirmar firewall com somente SSH, HTTP e HTTPS públicos.
- Restringir métodos e tamanho de corpo no Nginx quando o workflow não precisar
  de outras opções.
- Avaliar rate limiting no Nginx para o Webhook.
- Revisar permissões do usuário `zoho-deploy`, SSH e atualizações do sistema.

Aceite: chave rotacionada sem editar o código, tentativa sem autenticação
rejeitada e portas internas inacessíveis externamente.

## Prioridade 2 — operação e observabilidade

Objetivo: responder rapidamente a falhas sem registrar dados sensíveis.

- Adicionar endpoint de readiness separado do `/health`, verificando dependências
  sem renovar OAuth nem chamar operações de Lead.
- Definir formato de consulta dos logs por `request_id`, status e evento.
- Monitorar latência e taxa de erro HTTP/Zoho.
- Documentar alertas para falhas de token, 5xx e ausência de eventos.
- Validar retenção e acesso aos logs na VPS.

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
