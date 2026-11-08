# Mapa do SaaS MFL

O restaurante precisa atender, vender, produzir e acompanhar resultados. Cada etapa tem usuários, dados e requisitos de disponibilidade diferentes. O MFL separa essas responsabilidades e as integra por contratos.

## Capacidades e responsabilidades

| Camada | Usuários e capacidades | Responsabilidade técnica |
|---|---|---|
| Relacionamento e venda online | Consumidor: atendimento WhatsApp, cardápio, pedidos, reservas, avaliações e fidelidade | Backend por restaurante, contexto de conversa, transferência para humano e integrações externas |
| CRM e campanhas | Equipe: contatos, segmentação e comunicação com consentimento | Identidade canônica, opt-out, frequência, revalidação e fila de envio |
| Painel do restaurante | Gestor: cadastros e visão remota da operação | Interface web e camada de acesso aos sistemas responsáveis por cada dado |
| Operação local | Caixa, garçom e cozinha: PDV, caixa, mesas/comandas e KDS | Servidor local, SQLite, rede da loja e sincronização posterior |
| Gestão da plataforma | Operadores: cadastro, prontidão, suspensão e suporte aos restaurantes | Control plane, permissões e auditoria, com acesso restrito |
| Jornada comercial | Interessados e contas de restaurantes: cadastro, convite e acesso | Backend comercial separado da gestão operacional dos tenants |
| Operação do serviço | Manutenção, homologação e recuperação | CI/CD, imagens imutáveis, observabilidade e backup |

O cadastro comercial registra interesse; ele não provisiona infraestrutura automaticamente. A ativação do restaurante é uma operação controlada. O painel interno da plataforma tem responsabilidades e permissões diferentes das do painel do restaurante.

## Continuidade local

A operação local foi desenhada para continuar os fluxos implementados quando a internet cai. Uma venda confirmada é persistida junto com seu evento na mesma transação. O envio para a nuvem acontece depois. A cozinha e os terminais usam o servidor da loja.

Isso exige rede local e servidor disponíveis. Não implica receber pedidos online, autorizar pagamentos bancários, acessar relatórios remotos ou emitir documentos fiscais sem os serviços necessários.

## Estado e maturidade

Referência: revisão documental de 08/11/2026, baseada nos estados técnicos revisados em 06/11/2026. Nenhum ambiente foi consultado ao vivo.

| Área | Evidência disponível no projeto privado | Limite da afirmação pública |
|---|---|---|
| Núcleo SaaS | Código, testes, documentação operacional e casos selecionados | A suíte pública demonstra apenas os recortes extraídos |
| Operação local | Implementação e registros de testes de venda, caixa, PDV, garçom e KDS | Aceite presencial, Windows e periféricos ainda exigem validação própria |
| Sincronização | Outbox/inbox e ativação registrada na configuração aprovada | Não comprova pareamento, ingestão ou saúde atual de cada loja |
| Estoque, compras e financeiro | Implementação por módulos e registros de evolução | Não equivale a aceite integral dos fluxos por uma equipe |
| Fiscal | Implementação com fixtures e provedores simulados | Emissão mantida desligada; sem alegação de homologação real |
| Recuperação | Backup e ensaios parciais documentados | Não comprova recuperação integral dentro do tempo objetivo |

O repositório não publica métricas comerciais, quantidade atual de clientes ou disponibilidade sem uma medição datada e verificável. Seu foco é a engenharia demonstrável.
