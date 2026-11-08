# Roteiro técnico para apresentação

Sugestão de exposição de 10 a 12 minutos, adaptável ao tempo da banca. Este documento organiza a apresentação; não substitui o artigo, seus resultados medidos ou as exigências acadêmicas.

| Tempo | Mensagem | Apoio |
|---|---|---|
| 1 min | Problema: o restaurante atende e vende em canais diferentes, mas precisa manter uma operação coerente | [Mapa do produto](produto.md) |
| 2 min | Escopo: consumidor, equipe, gestor e operador da plataforma têm necessidades distintas | Tabela de responsabilidades do produto |
| 2 min | Arquitetura: núcleo por tenant, control plane e loja local integram-se por contratos | Diagrama de [arquitetura](arquitetura.md) |
| 2 min | Desafio central: confirmar uma venda sem depender da internet e sincronizá-la sem repetir efeitos | Sequência de outbox/inbox e suas limitações |
| 2 min | Evidência executável: venda offline, resposta perdida e reenvio sem duplicação | [Caso 11](casos/11-venda-offline-e-sincronizacao.md) e `npm run demo:sync` |
| 1 min | Entrega e manutenção: promover artefato homologado e distinguir rollback de recuperação | [CI/CD](ci-cd.md) |
| 1–2 min | Resultados demonstrados, limites e próximos aceites | [Evidências](evidencias.md) e estado do [produto](produto.md) |

## Linha de argumentação

**Problema:** continuidade operacional e consistência entre canais de um restaurante.

**Solução:** separar responsabilidades, manter os fluxos locais implementados independentes da internet e sincronizar eventos de forma idempotente.

**Contribuição técnica:** combinar isolamento por tenant, persistência transacional, tratamento de concorrência e entrega controlada em um produto integrado. Os casos públicos permitem discutir essas escolhas com código reproduzível.

**Avaliação:** demonstrar os testes dos recortes públicos e identificar suas condições. Para resultados do artigo, usar somente medições realmente coletadas, com método, período e cenário; a suíte pública não mede a disponibilidade nem o desempenho do SaaS completo.

## Perguntas para discussão

- **Por que não manter tudo na nuvem?** A venda local precisa persistir mesmo durante perda da conexão; isso traz o custo de manter um servidor na loja.
- **O reenvio duplica a venda?** O desenho usa inbox por tenant/evento e aplicação transacional. Entrega repetida não deve repetir o efeito; isso depende dessas garantias no destino.
- **Um banco por restaurante elimina falhas entre clientes?** Reduz riscos no nível da aplicação, mas infraestrutura compartilhada ainda pode falhar em conjunto.
- **O que acontece com relatórios durante a queda?** A loja mantém os fluxos locais; a visão remota pode ficar atrasada até a sincronização.
- **O que está pronto?** Separar código implementado, testes, configuração aprovada e aceite em campo conforme a tabela de maturidade.
- **O que o avaliador consegue executar?** Os exemplos e testes deste repositório, sem acesso ao produto privado.

Em entrevista, a mesma sequência permite aprofundar uma decisão: apresentar a restrição, comparar alternativas, executar um teste e explicar o que ele não comprova.
