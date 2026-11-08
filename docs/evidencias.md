# Evidências e limites

Este repositório combina documentação de arquitetura com código demonstrativo. A revisão de 08/11/2026 consultou referências locais de arquitetura integrada, estado do Gestor, frontends, provisionamento e decisões de sincronização. Essas fontes privadas não são copiadas nem exigidas para navegar no material público.

## O que pode ser conferido aqui

| Tema | Evidência pública | Limite |
|---|---|---|
| Admissão e deduplicação de webhook | [Implementação](../src/webhook/intake.js), [teste](../test/webhook-intake.test.js), caso 01 | Cache local; não prova durabilidade distribuída |
| Opt-out contextual | [Código](../src/consent/ambiguous-optout.js) e [teste](../test/ambiguous-optout.test.js) | Recorte das regras de comunicação |
| Evento de pagamento por conta | [Guard](../src/payments/connect-webhook-guard.js) e [teste](../test/connect-webhook-guard.test.js) | Não executa liquidação real |
| Pool de banco e reconexão | [Pool](../test/pool-safety.test.js) e [Redis](../test/redis-reconnect.test.js) | Dependências simuladas; não mede capacidade do ambiente |
| Provisionamento | [Preparação](../src/provisioning/prepare-tenant.js) e [teste](../test/prepare-tenant.test.js) | Não provisiona infraestrutura real |
| Scripts de operação | [Testes](../test/ops-scripts.test.js) e [scripts](../ops/) | Ambiente temporário; não é ensaio de desastre da plataforma |
| Operação offline e sync | [Persistência](../src/sync/store.js), [worker](../src/sync/worker.js), [testes SQLite](../test/integration/sync.test.js) e [demo](../examples/offline-sync.js) | Implementação demonstrativa; destino SQLite, sem transporte ou autenticação reais |

Execute `npm test` na raiz para reproduzir a suíte original. Para o recorte com banco real, execute `npm run test:sync` e `npm run demo:sync` com Node >= 22.13; há um job específico na CI em Node 22 e 24. O workflow também define testes em Node 20/22, ShellCheck e varredura de segredos. A presença do workflow não comprova que a execução remota mais recente passou.

## Critério de apresentação

Uma decisão documentada explica o desenho. Um teste automatizado demonstra um comportamento no cenário exercitado. Homologação verifica uma integração em um ambiente identificado. Aceite operacional verifica o uso com equipe, equipamento e condições reais. Esses níveis não são intercambiáveis.

Por isso o material não usa quantidade de commits como prova de qualidade, não promete disponibilidade sem medição e não declara emissão fiscal ou instalação física homologadas com base em mocks.

## Conteúdo público

Publicam-se responsabilidades, fluxos lógicos, alternativas, limitações e exemplos sintéticos. Permanecem privados dados de clientes, informações pessoais de operação, inventários de máquinas, endereços internos, catálogos de endpoints, credenciais, configurações de ambiente, payloads reais e procedimentos de acesso.

A documentação pública deve ser compreensível sem links para repositórios privados. Alterações futuras devem preservar essa propriedade e manter a distinção entre exemplo e comportamento do SaaS.
