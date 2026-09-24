# Idempotência de criação de Leads

## Estado atual

A API publica uma única réplica no Compose da VPS. `POST /api/leads` mantém o
cache de idempotência em memória por processo, usando `Idempotency-Key` ou
`X-Request-ID` como chave. A entrada contém o fingerprint do payload e a
promise da operação, com TTL de 24 horas e limite de 1.000 entradas.

Esse desenho cobre reenvios concorrentes e sequenciais enquanto a requisição
chega ao mesmo processo. Um reinício da API limpa o cache; duas réplicas podem
processar a mesma chave em processos diferentes.

## Decisão

Não adicionar uma store compartilhada nesta fase. A topologia atual não escala
horizontalmente e não possui Redis, Valkey ou banco de dados para operar,
monitorar, proteger e fazer backup. Manter a implementação local reduz pontos
de falha e preserva o contrato já validado.

A decisão deve ser revista antes de aumentar o número de réplicas ou colocar um
balanceador na frente da API.

## Opção recomendada para escala

Usar Valkey ou Redis com autenticação, rede privada e persistência definida pela
política da VPS. A operação de reserva deve ser atômica (`SET NX` com TTL),
contendo pelo menos:

- chave de idempotência;
- fingerprint do payload;
- estado `pending` ou `completed`;
- resposta pública sanitizada e status;
- expiração da entrada.

Uma chave existente com fingerprint diferente continua retornando `409`. Uma
entrada `pending` deve fazer os demais processos aguardarem ou retornarem uma
resposta transitória, sem chamar a Zoho novamente. Falha ou indisponibilidade da
store deve ser tratada como indisponibilidade controlada da criação, para não
permitir duplicidade silenciosa.

Não armazenar tokens, credenciais, payloads completos de Leads ou headers de
autenticação na store.

## Critério para iniciar a migração

Antes de adicionar a dependência, registrar:

1. número de réplicas e estratégia de balanceamento;
2. retenção, backup e restauração da store;
3. autenticação, rede e rotação de acesso;
4. métricas para conflitos, expirados, pendências e falhas;
5. teste de reinício de uma réplica durante uma criação.

A migração deve preservar os headers, códigos `200`, `201` e `409` e os testes
de contrato atuais.
