# Arquitetura do MyFoodLink (visão sanitizada)

O MyFoodLink é uma plataforma SaaS multi-tenant para restaurantes: atendimento por WhatsApp com transferência para humano, CRM, campanhas com consentimento, cardápio digital, pedidos, reservas, avaliações e fidelidade.

Endereços, nomes de servidores e credenciais foram omitidos.

```mermaid
flowchart LR
  subgraph Clientes
    C[Cliente final<br/>WhatsApp e web]
    R[Equipe do restaurante<br/>painel]
  end

  subgraph Vercel
    W[Sites e painéis<br/>Next.js + TypeScript<br/>monorepo Turborepo]
  end

  subgraph Borda
    CF[Cloudflare<br/>DNS, TLS, WAF]
    PX[Proxy reverso<br/>Nginx]
  end

  subgraph VPS de produção
    E[Evolution API<br/>WhatsApp]
    subgraph Por restaurante
      RT1[Router do restaurante A<br/>Node.js + Express]
      RT2[Router do restaurante B<br/>Node.js + Express]
    end
    CT[Control plane<br/>cadastro, provisionamento, auditoria]
    PG[(PostgreSQL<br/>um banco por restaurante)]
    RD[(Redis<br/>sessões e deduplicação)]
  end

  subgraph Operação
    BK[Backup WAL-G<br/>storage externo]
    OB[Prometheus, Grafana,<br/>Loki, alertas]
    SEC[Cofre de segredos]
  end

  C --> CF --> PX
  R --> W --> CF
  PX --> RT1 & RT2
  C -. mensagens .-> E -- webhook --> RT1 & RT2
  RT1 & RT2 --> PG & RD
  CT --> PG
  PG --> BK
  RT1 & RT2 & PG --> OB
  SEC -. no deploy .-> RT1 & RT2 & CT
```

## Decisões principais

| Decisão | Por quê |
|---|---|
| **Um processo, um banco e uma instância de WhatsApp por restaurante** | Isolamento: o bug ou a carga de um cliente não atinge outro, e é possível migrar, restaurar ou retirar um restaurante sozinho. |
| **Control plane separado**, acessível só por rede privada | Quem cria, suspende e audita restaurantes não fica exposto na internet. |
| **Frontends na Vercel, backend na VPS** | O site escala sozinho; o backend fica perto do banco e do WhatsApp. |
| **Produção não constrói, só executa** | Imagens Docker são construídas no CI, publicadas no GHCR e fixadas por digest. A VPS só puxa e roda. |
| **Segredos fora do repositório** | Cofre de segredos com acessos separados por ambiente; o CI falha se uma variável com nome de segredo aparecer em arquivo de configuração. |
| **Backup contínuo com recuperação ensaiada** | WAL-G com recuperação em ponto no tempo; o ensaio de restauração faz parte da rotina, não da teoria. |
| **Consentimento como regra de backend** | Opt-out global, limite de frequência, maioridade para bebida alcoólica e revalidação antes de cada envio de campanha. |

## Números do código (outubro de 2026)

| Repositório (privado) | Commits | Arquivos de teste |
|---|---|---|
| Router (atendimento, CRM, pedidos, reservas, campanhas) | 259 | 130 |
| Control plane (provisionamento e console da plataforma) | 60 | 17 |
| Infraestrutura (CD, backup, observabilidade, VPS) | 127 | 6 |

Além desses, o monorepo dos frontends (Next.js) e o site institucional.
