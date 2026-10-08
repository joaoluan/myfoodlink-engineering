# 10 · O risco de um subdomínio servir o restaurante errado

**Área:** multi-tenant · proxy reverso · isolamento

Este caso não tem código aqui, porque a correção é de procedimento e de verificação. Está registrado porque é o tipo de risco que só aparece em multi-tenant de verdade.

## Problema
Cada restaurante tem o próprio contêiner, atrás de um proxy reverso (Nginx) que encaminha `restaurante.dominio` para o contêiner certo pelo nome. O Nginx resolve o nome do contêiner **uma vez** e guarda o IP. Quando um contêiner é recriado, ele ganha IP novo, e o IP antigo pode ser **reaproveitado pelo contêiner de outro restaurante**. Sem cuidado, o subdomínio de um cliente poderia acabar servindo o sistema de outro.

## Solução
- Depois de recriar qualquer contêiner de tenant: `nginx -t` e **reload** do proxy, sempre.
- Validação pós-deploy que **não para no HTTP 200**: o endpoint `/live` devolve o `tenantId` e o slug, e o smoke test confere que são os do restaurante esperado.
- Webhooks e `proxy_pass` apontam para um nome de contêiner padronizado por tenant, sem alias de rede.

## O que aprendi
Em multi-tenant, "está respondendo" não basta. A pergunta é "está respondendo **o cliente certo**?".
