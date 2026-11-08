# 11 — Venda offline, resposta perdida e reenvio seguro

## Problema e desenho

A loja confirma uma venda sem internet. Depois a conexão volta, a nuvem recebe o evento e grava a projeção, mas a resposta se perde. O worker não sabe se houve gravação: precisa reenviar o mesmo evento. Sem deduplicação persistente, o relatório poderia contar a venda duas vezes.

Este caso implementa os padrões documentados para o Gestor em um exemplo independente. Não é um relato de incidente nem uma extração literal do serviço privado.

## Executar

Requer **Node >= 22.13**, com `node:sqlite` disponível. A API pode emitir aviso de experimental nas versões que ainda a classificam assim. Não é necessário instalar dependências, configurar credenciais ou subir contêineres.

```sh
npm run demo:sync
npm run test:sync
```

A demonstração cria dois arquivos de banco em um diretório temporário, usa somente identificadores fictícios e os remove ao terminar. A tabela de saída deve mostrar:

| Passo | Vendas locais | Eventos pendentes | Vendas remotas |
|---|---|---|---|
| Venda offline | 1 | 1 | 0 |
| Commit remoto seguido de perda da resposta | 1 | 1 | 1 |
| Reenvio com ACK recebido | 1 | 0 | 1 |

## Código para discutir

[store.js](../../src/sync/store.js) contém schema, validação e transações:

- Venda e outbox são gravadas na mesma transação. A função só retorna após o commit.
- Inbox usa chave composta por tenant e evento. O mesmo ID em outro tenant é independente.
- Evento repetido com conteúdo diferente gera conflito, em vez de ser silenciosamente aceito.
- Inbox e projeção são confirmadas juntas. Se a projeção falha, o registro de deduplicação também é desfeito.
- O tenant autenticado é recebido de um contexto externo e comparado ao evento.

[worker.js](../../src/sync/worker.js) executa uma rodada explícita, sem timers ocultos:

- Apenas o ID explicitamente confirmado marca o evento como enviado.
- Falhas mantêm o evento pendente com backoff limitado e jitter.
- O agendamento de retry é persistido e sobrevive à reabertura do banco.
- Chamadas simultâneas no mesmo worker compartilham a operação em andamento.

A injeção de relógio, transporte e aleatoriedade permite exercitar falhas sem rede ou esperas reais.

## Testes e alcance

A [suíte de integração](../../test/integration/sync.test.js) usa SQLite real e diretórios temporários. Exercita atomicidade local, persistência após reabertura, falha de conexão, commit remoto com resposta perdida, isolamento por tenant, conteúdo conflitante, rollback da inbox quando a projeção falha, ACK incorreto, chamadas simultâneas e validação monetária.

A reabertura comprova persistência entre conexões; não simula perda física de disco ou energia. A concorrência coberta é a de chamadas ao mesmo worker, não a de múltiplos processos.

## Simplificações deliberadas

No produto, o destino é PostgreSQL; aqui ambos os lados usam SQLite para permitir execução independente. O evento representa apenas venda confirmada com valor pago em centavos. Não inclui versões de agregados, estornos, comandos remotos, emissão fiscal ou fechamento de caixa.

O transporte é uma função injetada. Autenticação real, timeout de rede, autorização por dispositivo, pareamento e rotação de credenciais ficam fora deste exemplo. O parâmetro `authenticatedTenant` é uma pré-condição, não uma implementação de autenticação.

O exemplo usa um worker por conexão. Escala com múltiplos processos exigiria claim/lease persistente. Retenção da outbox/inbox, tratamento operacional de eventos inválidos e limites de armazenamento também precisam de políticas próprias. Não há promessa de processamento global exatamente uma vez: o efeito demonstrado depende da chave de deduplicação e da transação no destino.
