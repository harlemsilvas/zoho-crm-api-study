# Política operacional — retenção e rollback

Esta política se aplica à implantação em `zoho.hdevsolucoes.tech`. Os valores
abaixo são uma configuração inicial conservadora e devem ser revisados conforme
volume, custo e requisitos de recuperação.

## Retenção de backups

O backup contém o volume persistente do n8n, incluindo workflows e estado local.
Não inclui `.env`, `.env.n8n` ou credenciais do host.

- Backup diário: manter 14 dias no host.
- Backup semanal: manter 8 semanas em armazenamento externo.
- Antes de upgrade, alteração de Compose ou troca de credencial: executar backup
  adicional identificado com data e commit.
- Testar uma restauração mensal em volume temporário.
- Manter pelo menos uma cópia fora da VPS; backup apenas no mesmo disco não é
  proteção contra perda do host.

Listar backups sem alterar nada:

```bash
find ~/backups/zoho -maxdepth 1 -type f -name 'n8n-data-*.tar.gz' \
  -printf '%TY-%Tm-%Td %TH:%TM %s %p\n' | sort
```

Remover somente backups com mais de 14 dias, após confirmar que a cópia externa
semanal existe:

```bash
find ~/backups/zoho -maxdepth 1 -type f -name 'n8n-data-*.tar.gz' \
  -mtime +14 -print
```

O primeiro comando de remoção deve ser revisado visualmente antes de acrescentar
`-delete`. Não automatizar essa exclusão até existir uma cópia externa testada.

## Retenção de logs

O Compose limita cada container a cinco arquivos de 10 MB:

```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "5"
```

Isso limita aproximadamente 50 MB por container, sem contar outros logs do host.
Para o journal do systemd, revisar o uso e definir retenção de 30 dias conforme
a política da VPS:

```bash
journalctl --disk-usage
sudo journalctl --vacuum-time=30d
```

Não apagar logs durante uma investigação ativa. Exportar os eventos necessários
por `request_id` antes de aplicar limpeza.

## Validação de acesso e retenção de logs

Como `zoho-deploy`, valide acesso sem imprimir o conteúdo dos eventos:

```bash
docker logs --since 1m zoho-study-api >/dev/null
docker logs --since 1m zoho-study-n8n >/dev/null
docker inspect --format '{{.Name}} {{.HostConfig.LogConfig.Type}} {{json .HostConfig.LogConfig.Config}}' \
  zoho-study-api zoho-study-n8n
```

O resultado esperado para os dois containers é `json-file`, `max-size: 10m` e
`max-file: 5`. O acesso aos logs deve permanecer restrito ao operador autorizado
e ao grupo Docker; não conceder permissões adicionais apenas para observabilidade.

## Registro antes de um deploy

Antes de atualizar, registrar o estado atual sem imprimir segredos:

```bash
cd ~/zoho-crm-api-study
git rev-parse HEAD
docker compose --env-file .env.n8n -f compose.n8n.yaml -f compose.vps.yaml ps
docker image ls --format '{{.Repository}}:{{.Tag}} {{.ID}} {{.CreatedAt}}'
```

Executar um backup do volume e guardar o SHA junto do nome do arquivo. O arquivo
de ambiente permanece somente no host.

## Rollback da aplicação

1. Confirmar o incidente, salvar os logs recentes e interromper novos deploys.
2. Identificar o último SHA saudável registrado.
3. Fazer backup do estado atual do n8n antes de trocar a versão.
4. Preservar a configuração local de portas `3030` e `5679`.
5. Voltar o código para o SHA saudável e reconstruir:

```bash
git fetch origin
git status --short
git switch --detach SHA_SAUDAVEL
docker compose --env-file .env.n8n -f compose.n8n.yaml -f compose.vps.yaml up -d --build
```

6. Validar API, n8n, HTTPS, workflow e `X-Request-ID`.
7. Registrar a causa, os SHAs, o horário e o resultado. Depois do incidente,
   retornar a uma branch de deploy controlada; não deixar a VPS permanentemente
   em um checkout anônimo sem registro.

Não usar `git reset --hard` e não executar `docker compose down -v` como rollback.
O volume do n8n deve sobreviver à troca da imagem.

## Rollback do workflow n8n

Antes de importar uma nova versão, exportar a versão ativa sem incluir credenciais
e guardar o arquivo fora do diretório público. Em caso de falha:

1. Desativar a versão problemática.
2. Importar o último JSON conhecido como saudável.
3. Selecionar novamente a credencial Header Auth na VPS.
4. Ativar somente uma versão para o caminho `/webhook/zoho/leads`.
5. Testar autenticação inválida, validação 400 e uma execução controlada.

## Critérios de aceite

- Existem backups diários dentro da janela de 14 dias.
- Existe uma cópia semanal fora da VPS.
- Uma restauração mensal foi executada em volume temporário.
- Logs Docker respeitam `10m × 5` por container.
- O último SHA saudável e o backup correspondente estão registrados.
- Rollback de código e workflow foi ensaiado sem perda do volume n8n.
