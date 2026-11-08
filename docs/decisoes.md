# Decisões de engenharia

Síntese pública das escolhas do projeto, reconciliada documentalmente em 08/11/2026. São decisões de produto e arquitetura; os exemplos executáveis cobrem apenas parte delas.

| Problema | Escolha | Custo e alternativa |
|---|---|---|
| Separar dados e manutenção dos restaurantes | Processo e banco por tenant no núcleo online | Mais provisionamento e gestão de versões; tabelas compartilhadas simplificariam operação, mas exigiriam isolamento em todas as consultas |
| Continuar vendendo sem internet | SQLite e servidor na loja | Exige instalação, backup e manutenção locais; depender da nuvem simplificaria instalação e interromperia fluxos na queda da conexão |
| Persistir venda e intenção de sincronizar | Outbox na mesma transação do negócio | Fila, retenção e uso de disco precisam de gestão; duas gravações independentes podem perder eventos |
| Reenvio após falha de rede | Inbox por tenant/evento e projeção transacional | Mais armazenamento e contratos de evento; retry sem deduplicação pode repetir efeitos |
| Evitar edições conflitantes | Sistema responsável por campo | A interface precisa explicar salvamento parcial; cópias editáveis independentes criariam divergência |
| Reduzir impacto de acesso administrativo | Console interno separado, permissões e auditoria | Exige gestão de acesso e suporte; uma interface única ampliaria o alcance de credenciais |
| Comunicação automatizada responsável | Consentimento e opt-out revalidados antes do envio | Mais estados e restrições de fila; um aceite antigo não garante autorização atual |
| Promover o artefato homologado | Imagem fixada por digest e evidência de staging | Exige coordenação entre repositórios; construir no servidor introduziria variação no artefato |
| Distinguir falha de aplicação e perda de dados | Rollback de imagem separado de backup/restore | Procedimentos e ensaios próprios; rollback não substitui recuperação de banco |

## Regras que orientam a implementação

- Venda confirmada exige persistência local do negócio e do evento na mesma transação.
- Valores monetários usam centavos inteiros; faturamento soma pagamentos, não simplesmente pedidos.
- Identificadores precisam do contexto do tenant quando não são globais.
- Entrega aceita pelo provedor não prova recebimento pelo destinatário.
- Transferência ativa para humano impede resposta automática concorrente.
- Alterações remotas não devem ser apresentadas como aplicadas antes da confirmação do destino.

## Um exemplo público não substitui o contrato do produto

O [caso de webhook](casos/01-mensagens-duplicadas.md) responde com erro recuperável quando a admissão falha no demonstrativo. Isso permite estudar retry e concorrência. Não deve ser usado para inferir a política de resposta do webhook privado: persistência, provedor e tratamento de falhas mudam o contrato.

Da mesma forma, o cache em memória do exemplo não oferece deduplicação durável entre processos ou reinícios. A [sincronização transacional](arquitetura.md) é outro contexto, com inbox persistida e garantias distintas.
