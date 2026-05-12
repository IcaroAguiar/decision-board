# Documento Arquitetural — Portfolio Decision Dashboard

**Versão:** 0.1.0
**Data:** 2026-05-11
**Status:** Plano arquitetural para MVP open source
**Nome provisório:** Portfolio Decision Dashboard

## 1. Resumo executivo

O projeto é uma aplicação web open source, self-hostable e multiusuário para acompanhamento de carteira, planejamento de aportes recorrentes, aplicação de estratégias de alocação e geração de relatórios estruturados para análise externa, especialmente por IA.

O produto não é um home broker, não executa ordens, não substitui corretora e não promete recomendação financeira automática. Ele organiza dados da carteira, aplica regras explícitas de estratégia, emite alertas e gera snapshots em Markdown e JSON para que o usuário ou uma IA possam analisar a carteira com contexto suficiente.

A decisão arquitetural consolidada é:

```txt
Frontend: Vite + React + Tailwind
Backend: NestJS + TypeScript
Auth: Better Auth
Banco: PostgreSQL
ORM: Prisma
Jobs: pg-boss
Monorepo: pnpm workspaces
Relatórios: Markdown + JSON versionado
Market data: provider manual + brapi como adapter inicial
Deploy: Docker Compose + proxy reverso, preferencialmente Caddy ou Traefik
Licença recomendada: AGPL-3.0-only
```

## 2. Revisão crítica e ajustes após consolidação

### 2.1. Não usar “tempo real B3” como premissa

A aplicação deve trabalhar com snapshots atualizados sob demanda ou por rotina agendada. A B3 não deve ser tratada como uma API pública gratuita para pessoa física. A documentação da Área do Investidor da B3 indica APIs voltadas a clientes B2B, e market data oficial em tempo real normalmente envolve contrato, licenciamento e distribuição por vendors. Logo, a arquitetura deve ser provider-based e aceitar dados manuais, CSVs e APIs agregadoras.

**Decisão:** o MVP terá botão “Atualizar snapshot” e não “streaming em tempo real”.

### 2.2. brapi é provider, não fonte única de verdade

A brapi é útil para cotações, histórico, FIIs e dividendos, mas alguns endpoints podem exigir plano pago, token ou limitações por sandbox. O app não deve ficar quebrado se a brapi estiver indisponível.

**Decisão:** sempre existir provider manual. brapi entra como provider configurável.

### 2.3. Postgres desde o início

Como o projeto pode ser hospedado e liberado para usuários externos, SQLite deixa de ser a escolha correta para o MVP. A aplicação precisa lidar com autenticação, sessões, multiusuário, histórico e isolamento de dados.

**Decisão:** PostgreSQL desde o PR inicial de infraestrutura.

### 2.4. Auth robusta sem empilhar estratégias concorrentes

Se o projeto usar Better Auth, não deve misturar Passport, JWT manual e sessões paralelas sem necessidade. Isso aumenta superfície de erro.

**Decisão:** Better Auth será a camada primária de autenticação. A API usará sessão via cookie seguro. JWT só deve entrar se houver justificativa explícita e PR específico.

### 2.5. NestJS com adaptador HTTP simples no MVP

NestJS é escolhido pela modularidade. Porém, a integração com Better Auth deve ser simples. No MVP, priorizar o adaptador HTTP que reduza atrito de middleware/cookies. Performance não é gargalo.

**Decisão:** NestJS com estrutura modular; não otimizar adaptador HTTP antes de validação real. Usar Express adapter se a integração Better Auth for mais direta. Fastify pode ser avaliado posteriormente.

### 2.6. Modo simples antes de ledger completo

Exigir lançamento completo de transações desde o primeiro dia aumenta atrito. Para o MVP, o usuário deve poder cadastrar posições atuais diretamente. O ledger completo de compras, vendas e preço médio virá depois.

**Decisão:** MVP com `positions` manuais. `transactions` será introduzido em fase posterior, sem bloquear o uso inicial.

### 2.7. Estratégia não é recomendação financeira automática

O app pode dizer “sua carteira está acima do limite de papel/híbrido” ou “gere relatório quinzenal nesta estratégia”. Ele não deve se posicionar como consultor financeiro automatizado.

**Decisão:** MVP gera alertas, prioridades e relatórios. Sugestão específica de compra/venda só entra em fase posterior, com linguagem de simulação e decisão explícita do usuário.

## 3. Visão do produto

O usuário cadastra sua carteira, caixa disponível, plano de aporte recorrente e estratégia desejada. Em seguida, o app calcula pesos, exposição, alertas, dividendos estimados, frequência recomendada de revisão e gera um relatório exportável para análise externa.

Fluxo principal:

```txt
1. Usuário cria conta.
2. Usuário cria carteira.
3. Usuário cadastra ativos e posições atuais.
4. Usuário cadastra caixa, como CDB liquidez diária.
5. Usuário cadastra aporte recorrente.
6. Usuário escolhe estratégia.
7. App atualiza snapshot de preços.
8. App calcula alocação e alertas.
9. App gera relatório Markdown e JSON.
10. Usuário envia relatório a uma IA, consultor ou usa internamente.
```

## 4. Personas iniciais

### 4.1. Investidor pessoa física com aporte mensal

Quer organizar a carteira, evitar decisões impulsivas, manter estratégia e pedir análise externa periodicamente.

### 4.2. Desenvolvedor investidor

Quer self-hosting, controle de dados, export estruturado e possibilidade de customização.

### 4.3. Usuário que não acompanha mercado diariamente

Precisa de baixa manutenção, alertas objetivos e rotina mensal de aporte.

## 5. Objetivos do MVP

O MVP deve permitir:

1. autenticar usuários;
2. criar carteira;
3. cadastrar ativos e posições;
4. cadastrar caixa;
5. cadastrar aporte recorrente;
6. escolher uma estratégia;
7. atualizar preços manualmente via botão;
8. calcular alocação;
9. emitir alertas básicos;
10. gerar relatório Markdown;
11. gerar relatório JSON;
12. manter histórico de snapshots.

## 6. Fora do escopo do MVP

Não implementar no MVP:

```txt
- execução de ordens
- integração com corretora
- scraping da B3 ou de corretoras
- login automatizado na B3
- cálculo completo de IR
- recomendação financeira automatizada
- mobile app nativo
- streaming em tempo real
- backtests complexos
- IA interna tomando decisão
- PDF como formato principal
```

## 7. Estratégias do produto

Estratégias são perfis operacionais compostos por objetivo, limites, alertas e frequência de revisão.

### 7.1. Pouca manutenção

```json
{
  "id": "low_maintenance",
  "name": "Pouca manutenção",
  "riskLevel": "low_medium",
  "reportIntervalDays": 30,
  "rules": {
    "maxSingleAssetPercent": 25,
    "maxPaperHybridPercent": 30,
    "minBrickPercent": 60,
    "maxSectorPercent": 45,
    "requiresManualReviewBeforeBuy": false
  }
}
```

Uso: investidor que quer previsibilidade, baixa rotação e menor necessidade de acompanhamento.

### 7.2. Renda mensal alta

```json
{
  "id": "high_income",
  "name": "Renda mensal alta",
  "riskLevel": "moderate_high",
  "reportIntervalDays": 15,
  "rules": {
    "maxSingleAssetPercent": 20,
    "maxPaperHybridPercent": 50,
    "minEstimatedDividendYieldPercent": 10,
    "requiresManualReviewBeforeBuy": true
  }
}
```

Uso: investidor que aceita mais crédito, mais fundos ativos e maior frequência de revisão.

### 7.3. Crescimento equilibrado

```json
{
  "id": "balanced_growth",
  "name": "Crescimento equilibrado",
  "riskLevel": "medium",
  "reportIntervalDays": 30,
  "rules": {
    "maxSingleAssetPercent": 22,
    "maxPaperHybridPercent": 35,
    "maxSectorPercent": 40,
    "minCashPercent": 0
  }
}
```

Uso: retorno total, não apenas dividendos.

### 7.4. Oportunista

```json
{
  "id": "opportunistic",
  "name": "Oportunista",
  "riskLevel": "high",
  "reportIntervalDays": 7,
  "rules": {
    "maxSingleAssetPercent": 15,
    "minCashPercent": 10,
    "requiresManualReviewBeforeBuy": true,
    "requiresRiskChecklist": true
  }
}
```

Uso: compra de ativos descontados e maior volatilidade. Deve gerar relatórios mais frequentes.

### 7.5. Defensiva

```json
{
  "id": "defensive",
  "name": "Defensiva",
  "riskLevel": "low",
  "reportIntervalDays": 30,
  "rules": {
    "maxSingleAssetPercent": 20,
    "maxPaperHybridPercent": 20,
    "minCashPercent": 10,
    "maxHighYieldAssetsPercent": 10
  }
}
```

Uso: preservação, caixa maior e menor exposição a ativos complexos.

## 8. Stack recomendada

### 8.1. Frontend

```txt
Vite
React
TypeScript
Tailwind CSS
TanStack Query
React Hook Form
Zod
Recharts
```

Motivo: boa produtividade, alta compatibilidade com ecossistema TypeScript, componentização simples e integração com APIs REST.

### 8.2. Backend

```txt
NestJS
TypeScript
Better Auth
Prisma
PostgreSQL
pg-boss
Zod
OpenAPI
```

Motivo: domínio modular, autenticação robusta, banco relacional, jobs em Postgres, contratos de API documentáveis.

### 8.3. Infraestrutura

```txt
Docker Compose
PostgreSQL container
API container
Web container
Caddy ou Traefik como proxy opcional
```

Motivo: facilidade de self-hosting e reprodução de ambiente.

### 8.4. Monorepo

```txt
pnpm workspaces
```

Motivo: compartilhar tipos, regras de domínio e geradores de relatório entre web, api e pacotes.

## 9. Trade-offs técnicos principais

### 9.1. Node/TypeScript vs Go

| Critério | Node/TypeScript | Go |
|---|---|---|
| Velocidade de MVP | Alta | Média |
| Compartilhamento com frontend | Excelente | Baixo |
| Better Auth | Encaixe natural | Exigiria alternativa |
| Performance bruta | Suficiente | Excelente |
| Deploy | Bom | Excelente |
| Domínio do produto | CRUD, relatórios, regras, JSON | API/infra/worker de alta performance |

**Decisão:** Node/TypeScript. O gargalo do produto é UX, domínio, relatórios e integração, não throughput.

### 9.2. NestJS vs Fastify puro

| Critério | NestJS | Fastify |
|---|---|---|
| Estrutura modular | Alta | Depende da disciplina |
| Boilerplate | Maior | Menor |
| Crescimento do projeto | Melhor | Bom, mas menos opinativo |
| Open source com vários módulos | Melhor | Requer convenções fortes |

**Decisão:** NestJS. Se o projeto ficar pesado, avaliar Nest com Fastify adapter ou Fastify puro em fase posterior.

### 9.3. Prisma vs Drizzle

| Critério | Prisma | Drizzle |
|---|---|---|
| DX inicial | Excelente | Boa |
| Onboarding contributors | Mais simples | Mais SQL-oriented |
| Controle SQL | Médio | Alto |
| Produtividade MVP | Alta | Média/alta |

**Decisão:** Prisma no MVP. Usar SQL bruto quando necessário para agregações específicas.

### 9.4. PostgreSQL vs SQLite

| Critério | PostgreSQL | SQLite |
|---|---|---|
| Multiusuário | Forte | Limitado |
| Sessões/Auth | Forte | Possível, mas menos ideal |
| Jobs | Forte com pg-boss | Limitado |
| Self-host externo | Melhor | Menos adequado |

**Decisão:** PostgreSQL desde o início.

### 9.5. Better Auth vs Zitadel

| Critério | Better Auth | Zitadel |
|---|---|---|
| MVP TS | Melhor | Mais pesado |
| Self-host simples | Bom | Mais infraestrutura |
| Enterprise/OIDC/SAML | Menor | Excelente |
| Curva | Menor | Maior |

**Decisão:** Better Auth no MVP. Zitadel só se houver necessidade enterprise.

### 9.6. pg-boss vs BullMQ

| Critério | pg-boss | BullMQ |
|---|---|---|
| Infra extra | Não | Requer Redis |
| Adequação a jobs simples | Alta | Alta |
| Throughput alto | Médio | Alto |
| Self-host simples | Melhor | Mais componentes |

**Decisão:** pg-boss no MVP para evitar Redis.

## 10. Arquitetura lógica

```txt
┌─────────────────────────────────────┐
│              Web App                │
│  React + Vite + Tailwind            │
└──────────────────┬──────────────────┘
                   │ HTTPS / Cookie session
┌──────────────────▼──────────────────┐
│                API                  │
│  NestJS + Better Auth               │
│                                     │
│  Modules:                           │
│  - auth                             │
│  - portfolios                       │
│  - assets                           │
│  - positions                        │
│  - cash                             │
│  - contribution-plans               │
│  - strategies                       │
│  - market-data                      │
│  - snapshots                        │
│  - reports                          │
└──────────────────┬──────────────────┘
                   │ Prisma
┌──────────────────▼──────────────────┐
│             PostgreSQL              │
│  app data + auth data + jobs        │
└──────────────────┬──────────────────┘
                   │
┌──────────────────▼──────────────────┐
│              pg-boss                │
│  recurring jobs, snapshot jobs      │
└─────────────────────────────────────┘

External providers:
- Manual provider
- brapi provider
- CSV import, future
- CVM/FNET, future
```

## 11. Estrutura de repositório

```txt
portfolio-decision-dashboard/
  apps/
    web/
    api/
  packages/
    core/
    strategies/
    reports/
    market-data/
    types/
    config/
  prisma/
    schema.prisma
    migrations/
  docs/
    architecture.md
    execution-plan.md
  infra/
    docker/
  AGENTS.md
  README.md
  SECURITY.md
  CONTRIBUTING.md
  LICENSE
  pnpm-workspace.yaml
  package.json
```

## 12. Pacotes internos

### 12.1. `packages/core`

Regras puras de domínio:

```txt
- calcular valor total da carteira
- calcular peso por ativo
- calcular alocação por categoria
- calcular dividendos estimados
- avaliar limites da estratégia
- gerar alertas
```

Não pode depender de NestJS, React, Prisma ou banco.

### 12.2. `packages/strategies`

Define estratégias, limites, cadências e metadados.

### 12.3. `packages/reports`

Gera relatórios:

```txt
- Markdown
- JSON
- JSON Schema
```

### 12.4. `packages/market-data`

Define interface de providers e implementações:

```txt
- manual
- brapi
- future-csv
- future-cvm
```

### 12.5. `packages/types`

Tipos compartilhados entre API e web.

## 13. Modelo de dados inicial

### 13.1. Auth

Better Auth gerencia tabelas de usuário, sessão, conta e verificação conforme o adapter definido.

O schema inicial do MVP inclui `users` apenas como âncora de ownership para as tabelas de domínio. Antes de expor autenticação real no PR-004, a integração Better Auth deve escolher explicitamente uma das rotas abaixo:

```txt
1. alinhar `users` ao schema gerado pelo Better Auth CLI e adicionar Session, Account e Verification; ou
2. configurar Better Auth com modelName/field mapping para `users` e `advanced.database.generateId = "uuid"`.
```

Nenhuma rota autenticada deve ser criada até esse alinhamento estar implementado e testado.

### 13.2. Portfolios

```txt
portfolios
- id
- user_id
- name
- base_currency
- created_at
- updated_at
```

### 13.3. Assets

```txt
assets
- id
- ticker
- name
- asset_type
- segment
- risk_category
- currency
- exchange
- is_active
- created_at
- updated_at
```

`assets` pode ser global, mas classificações customizadas do usuário devem ficar em tabela separada.

### 13.4. User asset overrides

```txt
user_asset_overrides
- id
- user_id
- asset_id
- custom_name
- custom_segment
- custom_risk_category
- notes
```

### 13.5. Positions MVP

```txt
positions
- id
- user_id
- portfolio_id
- asset_id
- quantity
- average_price
- manual_current_price
- source
- notes
- created_at
- updated_at
```

No MVP, esta tabela é a fonte primária da carteira.

### 13.6. Transactions, fase posterior

```txt
transactions
- id
- user_id
- portfolio_id
- asset_id
- type
- date
- quantity
- unit_price
- fees
- taxes
- source
- notes
```

Quando `transactions` estiver madura, posição atual poderá ser derivada do ledger.

### 13.7. Cash accounts

```txt
cash_accounts
- id
- user_id
- portfolio_id
- name
- type
- balance
- liquidity
- benchmark
- benchmark_percent
- notes
```

Exemplo: CDB liquidez diária, 100% CDI, D+0.

### 13.8. Contribution plans

```txt
contribution_plans
- id
- user_id
- portfolio_id
- amount
- frequency
- day_of_month
- starts_at
- ends_at
- is_active
- default_strategy_id
- cash_account_id
- created_at
- updated_at
```

### 13.9. Contribution cycles

```txt
contribution_cycles
- id
- user_id
- portfolio_id
- contribution_plan_id
- reference_month
- planned_amount
- confirmed_amount
- status
- strategy_id
- report_id
- created_at
- updated_at
```

Status:

```txt
pending
confirmed
skipped
reported
closed
```

### 13.10. Strategies

Estratégias padrão podem estar em código. Estratégias customizadas podem ir ao banco.

```txt
strategies
- id
- user_id nullable
- name
- risk_level
- report_interval_days
- rules_json
- is_system
- created_at
- updated_at
```

### 13.11. Price snapshots

```txt
price_snapshots
- id
- asset_id
- price
- currency
- provider
- captured_at
- raw_payload_json
```

### 13.12. Portfolio snapshots

```txt
portfolio_snapshots
- id
- user_id
- portfolio_id
- strategy_id
- captured_at
- monthly_contribution
- available_cash
- total_value
- estimated_monthly_dividends
- allocation_json
- alerts_json
- payload_json
```

### 13.13. Reports

```txt
reports
- id
- user_id
- portfolio_id
- snapshot_id
- format
- content
- schema_version
- created_at
```

## 14. API inicial

Exemplos de endpoints:

```txt
GET    /health
GET    /auth/session
POST   /portfolios
GET    /portfolios
GET    /portfolios/:id
PATCH  /portfolios/:id

POST   /portfolios/:id/positions
GET    /portfolios/:id/positions
PATCH  /portfolios/:id/positions/:positionId
DELETE /portfolios/:id/positions/:positionId

POST   /portfolios/:id/cash-accounts
GET    /portfolios/:id/cash-accounts
PATCH  /portfolios/:id/cash-accounts/:cashAccountId

POST   /portfolios/:id/contribution-plans
GET    /portfolios/:id/contribution-plans
PATCH  /portfolios/:id/contribution-plans/:planId

GET    /strategies
GET    /strategies/:id

POST   /portfolios/:id/snapshots
GET    /portfolios/:id/snapshots
GET    /portfolios/:id/snapshots/:snapshotId

POST   /portfolios/:id/reports
GET    /portfolios/:id/reports
GET    /portfolios/:id/reports/:reportId
```

Todos os endpoints de carteira devem escopar por `userId` da sessão.

## 15. Market data

Interface mínima:

```ts
export interface MarketDataProvider {
  getQuote(ticker: string): Promise<QuoteSnapshot | null>;
  getQuotes(tickers: string[]): Promise<QuoteSnapshot[]>;
  getDividends?(ticker: string): Promise<DividendEvent[]>;
}
```

Providers:

```txt
manual: sempre disponível
brapi: configurável via BRAPI_TOKEN
csv: fase posterior
cvm/fnet: fase posterior
```

Regras:

1. O app deve continuar funcionando sem provider externo.
2. Falha de provider não pode apagar dados manuais.
3. Todo snapshot deve salvar provider, horário e payload bruto opcional.
4. Dados externos devem ser tratados como informacionais, não como verdade absoluta.

## 16. Relatórios

### 16.1. Markdown

Formato humano, bom para enviar em chat ou anexar ao histórico.

Seções mínimas:

```txt
- resumo executivo
- estratégia ativa
- aporte previsto
- caixa disponível
- carteira atual
- alocação por categoria
- alertas
- frequência recomendada de análise
- mudanças desde último relatório
- perguntas sugeridas para análise externa
```

### 16.2. JSON

Formato estruturado para IA e sistemas.

Campos mínimos:

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-05-11T00:00:00.000Z",
  "strategy": {},
  "cash": {},
  "portfolio": {},
  "positions": [],
  "allocation": {},
  "alerts": [],
  "reviewPolicy": {},
  "userNotes": []
}
```

Nunca incluir no JSON:

```txt
- e-mail do usuário
- CPF
- tokens
- credenciais
- dados de sessão
- identificadores internos desnecessários
```

## 17. Segurança

### 17.1. Requisitos mínimos

```txt
- HTTPS obrigatório em produção
- cookies httpOnly, secure e sameSite apropriado
- rate limit em login e rotas sensíveis
- validação de input com Zod ou DTOs equivalentes
- CORS restrito
- secrets apenas via env
- logs sem tokens ou dados sensíveis
- backup do Postgres
- isolamento por userId em todas as queries
```

### 17.2. Isolamento multiusuário

No MVP, usar isolamento por camada de aplicação com repositories que sempre recebem `userId`.

Regra arquitetural:

```txt
Controller -> Service -> Repository(userId, ...)
```

Nenhuma query de carteira pode ser feita sem `userId`.

### 17.3. RLS no Postgres

Postgres Row Level Security pode ser adotado como defense-in-depth em fase posterior. No MVP, evitar implementar RLS se isso atrasar o produto ou criar conflito com Prisma, pooling e Better Auth. A decisão de ativar RLS deve vir com testes específicos.

## 18. Qualidade e testes

### 18.1. Testes obrigatórios

```txt
- unitários para packages/core
- unitários para strategies
- unitários para reports
- integração para repositories
- e2e mínimo para auth e portfolios
- teste de isolamento: usuário A não acessa dados do usuário B
```

### 18.2. Comandos esperados

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

### 18.3. CI mínimo

```txt
- install
- lint
- typecheck
- test
- build
- migration check
```

### 18.4. Segurança open source

Adicionar gradualmente:

```txt
- Dependabot ou Renovate
- CodeQL
- OpenSSF Scorecard
- SECURITY.md
- política de disclosure
```

## 19. Deploy

### 19.1. Docker Compose

Serviços iniciais:

```txt
postgres
api
web
```

Serviços opcionais:

```txt
caddy
```

### 19.2. Variáveis de ambiente

```txt
DATABASE_URL=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
WEB_ORIGIN=
BRAPI_TOKEN=
MARKET_DATA_PROVIDER=manual|brapi
NODE_ENV=production
```

### 19.3. Backup

Para uso externo, backup não é opcional.

```txt
- backup diário do Postgres
- retenção mínima de 7 dias
- teste de restore antes de liberar usuários externos
```

## 20. Licença

Recomendação: **AGPL-3.0-only**.

Motivo: o projeto é web e self-hostable. AGPL reduz o risco de alguém criar um SaaS fechado com o código sem devolver melhorias à comunidade.

Alternativa: **MIT**, caso o objetivo seja máxima adoção com mínima restrição.

Decisão sugerida para o início: AGPL-3.0-only. Pode ser revisada antes de tração pública relevante.

## 21. Riscos do projeto

| Risco | Impacto | Mitigação |
|---|---|---|
| Dependência de provider externo | Alto | provider manual obrigatório |
| Produto virar recomendador financeiro | Alto | linguagem de organização/análise, não prescrição |
| Escopo crescer demais | Alto | MVP limitado a dashboard, estratégia e relatório |
| Vazamento de dados | Alto | auth, userId, logs seguros, backup, rate limit |
| B3/corretora bloquearem automações | Alto | não fazer scraping nem login automatizado |
| Cálculo financeiro incorreto | Médio | testes de domínio e transparência dos cálculos |
| Baixa adoção open source | Médio | Docker Compose, docs claras e AGENTS.md forte |

## 22. Roadmap resumido

### Fase 0 — Governança e arquitetura

README, licença, AGENTS.md, docs, decisões técnicas.

### Fase 1 — Base multiusuário

Auth, Postgres, portfolios, positions, cash.

### Fase 2 — Estratégias e recorrência

Contribution plans, cycles, strategy engine, alertas.

### Fase 3 — Market data

Manual provider e brapi provider.

### Fase 4 — Relatórios

Markdown, JSON, histórico e export.

### Fase 5 — Sugestão de aporte

Simulação e propostas não-prescritivas baseadas em estratégia.

### Fase 6 — Hardening

Backups, RLS opcional, security scan, CSV import, histórico avançado.

## 23. Referências consultadas

- Better Auth — documentação e cookies: https://better-auth.com/docs/concepts/cookies
- Better Auth — PostgreSQL adapter: https://better-auth.com/docs/adapters/postgresql
- NestJS — documentação oficial: https://docs.nestjs.com/
- Fastify — website oficial: https://fastify.io/
- Go — website oficial: https://go.dev/
- Prisma — website oficial: https://www.prisma.io/
- Drizzle ORM — website oficial: https://orm.drizzle.team/
- pg-boss — repositório oficial: https://github.com/timgit/pg-boss
- brapi — documentação geral: https://brapi.dev/docs
- brapi — cotações: https://brapi.dev/docs/acoes
- brapi — dividendos FIIs: https://brapi.dev/docs/fiis/dividendos
- pnpm workspaces: https://pnpm.io/workspaces
- Docker Compose: https://docs.docker.com/compose/
- PostgreSQL Row Level Security: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- OpenSSF Scorecard: https://github.com/ossf/scorecard
- AGENTS.md standard: https://agents.md/
