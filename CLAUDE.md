# CLAUDE.md

Use este arquivo junto com `AGENTS.md`. O `AGENTS.md` é a referência principal
do projeto; este arquivo reforça o comportamento esperado do agente.

## Princípio central

Trabalhe como engenheiro disciplinado: entenda, especifique, implemente pouco,
revise o diff, valide e explique. Este laboratório integra serviços reais e
credenciais OAuth; não faça alterações às cegas nem use o CRM real como teste
automatizado.

## 1. Pense antes de codar

- Leia o contexto obrigatório definido em `AGENTS.md`.
- Entenda o problema antes de tocar arquivos e confira branch e status.
- Declare premissas quando elas afetarem a solução.
- Se uma ação envolver risco não coberto pela autorização existente, explique
  antes de executar. Faça perguntas curtas quando a decisão não puder ser inferida.
- Prossiga com trabalho já autorizado sem pedir confirmações repetidas.

## 2. Simplicidade primeiro

- Faça a menor alteração correta.
- Não crie abstrações especulativas nem flexibilidade não solicitada.
- Não reescreva módulos inteiros se uma correção local resolve.
- Preserve os padrões existentes e prefira recursos nativos do Node.js.

## 3. Mudanças cirúrgicas

- Toque apenas nos arquivos necessários e preserve mudanças existentes do usuário.
- Não limpe código antigo fora da tarefa nem reformate arquivos inteiros sem motivo.
- Remova apenas código morto criado pela sua própria mudança.
- Cada linha alterada deve responder: "por que isto era necessário?"
- Respeite a etapa solicitada; não antecipe as próximas fases de observabilidade.

## 4. Validação orientada a objetivo

Para bugs: reproduza ou identifique a causa, corrija e rode o teste focado.
Para features: defina o comportamento esperado, implemente em passos pequenos
e teste contratos HTTP, erros e operações assíncronas quando aplicável.

- Execute a suíte completa nos pontos definidos em `AGENTS.md` e no handoff.
- Use cliente Zoho e fetch simulados; os testes não devem acessar a conta real.
- Revise o diff e execute `git diff --check` antes da entrega.
- Atualize a documentação relevante e relate limitações da validação.

## 5. OAuth, Leads e infraestrutura

- Não leia, imprima ou modifique os valores de `.env` e `.env.n8n`.
- Nunca exponha tokens, segredos, headers de autenticação ou dados pessoais
  de Leads nos logs.
- Preserve o Access Token em memória, a validação dos campos e a confirmação
  explícita de atualizações.
- Não crie nem atualize Leads reais sem autorização explícita do usuário.
- Preserve a exposição local dos serviços e o volume do n8n. Não remova volumes
  nem faça mudanças diretas em produção sem autorização e plano claro.

## 6. Comunicação

- Seja claro, curto e específico; use português nas explicações ao usuário.
- Explique o que foi feito, o que foi validado e o que falta.
- Não esconda incertezas nem afirme que algo foi testado se não foi.
- Quando houver risco concreto na ação proposta, diga antes de executar.

## 7. Commit e deploy

- Commit, push e deploy dependem de autorização explícita do usuário.
- Antes de um commit autorizado, confira `git status` e revise o diff.
- Inclua apenas arquivos relacionados; exclua credenciais, arquivos de ambiente,
  `.venv`, `.vscode` e artefatos locais conforme `AGENTS.md`.
- Após deploy autorizado, registre SHA/release e a validação quando relevante.
