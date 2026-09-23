# Zoho CRM API Study — relato para portfólio

## Resumo

Projeto prático de integração entre n8n, uma API Express em Node.js e o Zoho
CRM V8. O estudo começou com OAuth 2.0 e evoluiu para uma aplicação publicada
com autenticação de webhook, validação de Leads, observabilidade e correlação.

## Evolução

1. OAuth com Refresh Token e Access Token somente em memória.
2. Listagem, consulta, criação e atualização de Leads com confirmação explícita.
3. API Express com validação, contratos HTTP e testes `node:test`.
4. Webhook n8n com Header Auth e normalização de payload.
5. Logs JSON, duração e `X-Request-ID` com `AsyncLocalStorage`.
6. Docker, usuário operacional, Nginx, HTTPS e domínio público.

## Decisões técnicas

- Recursos nativos do Node.js, sem biblioteca adicional de logging.
- Redação defensiva de credenciais, headers, payloads e dados pessoais.
- Rotas e parâmetros sensíveis não entram nos logs.
- API presa a loopback; Nginx é a única camada pública.
- Portas separadas: API `3030:3000` e n8n `5679:5678`.
- Testes automatizados usam mocks e não dependem do Zoho.

## Resultado

- 53 testes automatizados aprovados.
- Testes de contexto assíncrono, concorrência e redação de segredos.
- Testes de contratos HTTP, erros, status e duração.
- Teste real controlado de criação de Lead via HTTPS.
- Correlação comprovada entre execução n8n, API e Zoho.

## Texto para LinkedIn

Construí e publiquei uma integração entre n8n, Node.js/Express e Zoho CRM V8.
O projeto começou como um estudo de OAuth 2.0 e evoluiu para uma API com
validação de Leads, autenticação de webhook, Docker, HTTPS e observabilidade.

Implementei correlação ponta a ponta com `X-Request-ID` usando `AsyncLocalStorage`
e logs JSON seguros, sem registrar tokens, headers de autenticação ou dados
pessoais. A solução foi validada com 53 testes automatizados e uma execução real
controlada através de `zoho.hdevsolucoes.tech`, com o mesmo identificador
acompanhando n8n, API e Zoho.

## Próximas melhorias

- backup automatizado e restauração testada do volume do n8n;
- rotação e retenção centralizada dos logs;
- monitoramento e alertas;
- pipeline de deploy com revisão e rollback;
- documentação pública com diagramas sem dados sensíveis.
