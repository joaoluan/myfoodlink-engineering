# 08 · Deploy que se protege sozinho

**Área:** CI/CD · operação

Detalhes completos em [`docs/ci-cd.md`](../ci-cd.md).

## Problema
Na VPS antiga, código, build e execução conviviam no mesmo servidor. Não havia garantia de que o que foi testado era exatamente o que estava no ar, nem um caminho rápido de volta. Na migração para a infraestrutura nova, a regra passou a ser:

> **Produção não constrói o MyFoodLink. Produção executa o MyFoodLink.**

## Solução
- **Aprovação = merge** de um PR que muda o arquivo de versões, com imagens fixadas por **digest**.
- A VPS **puxa** a release a cada 5 minutos. Não há SSH de deploy nem código-fonte no servidor.
- **Portões:** CI verde → backup com menos de 26 h → imagens por digest → healthcheck → smoke test.
- **Rollback automático** para a última versão boa se qualquer passo falhar depois de começar, e o commit é marcado como ruim para não ser tentado de novo.
- Toda rodada publica métricas (`deploy_ok`, último sucesso), com alerta.

## Problemas reais no caminho
- O cron roda com `PATH` mínimo: o CLI do cofre de segredos não era encontrado e o deploy falhava **sem publicar a falha**. Corrigido com `PATH` explícito e métrica em toda rodada.
- Token fine-grained do GitHub não lê check-runs: o CI passou a ser conferido pelos workflow runs do Actions.
- Restaurante com hífen no nome quebrava o healthcheck, porque o nome do contêiner usa underscore.
- Rollback ensaiado de propósito em produção (06/10/2026): uma falha foi injetada só no smoke test, e o sistema voltou sozinho para a release anterior com todos os serviços healthy.

## Código e testes
- [`ops/deploy-pull.sh`](../../ops/deploy-pull.sh) (versão sanitizada) e [`ops/verificar-digests.sh`](../../ops/verificar-digests.sh)
- [`test/ops-scripts.test.js`](../../test/ops-scripts.test.js): deploy bloqueado sem backup recente e gate de digest.
