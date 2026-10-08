# 09 · Provisionar um restaurante sem deixar nada pela metade

**Área:** multi-tenant · automação · segurança operacional

## Problema
Cada restaurante novo precisa de banco, contêiner, instância de WhatsApp, domínio, TLS e segredos próprios. Feito à mão, era lento e sujeito a erro. Automatizado de forma ingênua, uma falha na 3ª etapa deixava as duas primeiras para trás, e a próxima tentativa batia em conflito.

## Solução (padrão aplicado no provisionador real)
- **Preflight** antes de criar qualquer coisa: slug válido, nada pré-existente que não seja nosso.
- **Confirmação explícita:** o operador repete o slug do restaurante.
- **Criação exclusiva** (`wx`): nunca sobrescreve.
- **Rollback só do que a tentativa criou**, em ordem inversa. Nunca apaga algo que já existia.
- **Idempotência:** o manifesto é escrito por último; se existe, uma nova execução não recria nada (nem regera segredos).
- Segredos gerados na hora, com `.env` em permissão 600.

## Código e testes
- [`src/provisioning/prepare-tenant.js`](../../src/provisioning/prepare-tenant.js) (versão didática, com arquivos; a real também cria banco, contêiner, DNS e TLS)
- [`test/prepare-tenant.test.js`](../../test/prepare-tenant.test.js): falha simulada no meio, idempotência e proteção de dados pré-existentes.
