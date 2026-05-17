# Documento de Execução — Checklist Operacional e Plano por Fases/PRs

**Versão:** 0.1.0
**Data:** 2026-05-11
**Projeto:** Portfolio Decision Dashboard
**Objetivo:** guiar a execução por agentes humanos ou IA sem ambiguidade operacional.

## 1. Regra geral de execução

Cada PR deve entregar uma unidade pequena, verificável e reversível. Nenhum PR deve misturar fundação técnica, funcionalidade de produto e refactor amplo sem necessidade explícita.

Todo PR deve preencher este checklist no corpo da PR:

```md
## Objetivo

## Escopo entregue

## Fora do escopo

## Checklist técnico
- [ ] Li `docs/architecture.md`
- [ ] Li `AGENTS.md`
- [ ] Alterações estão dentro do escopo desta PR
- [ ] Nenhum dado sensível foi logado
- [ ] Toda query de carteira é escopada por `userId`
- [ ] Não foi criado scraping da B3/corretoras
- [ ] Não foi adicionada recomendação financeira prescritiva

## Checklist de qualidade
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`

## Checklist de banco
- [ ] Migrations foram criadas quando necessário
- [ ] Migrations foram testadas em banco limpo
- [ ] Não há alteração destrutiva sem justificativa

## Checklist de documentação
- [ ] README/docs atualizados quando necessário
- [ ] Exemplos atualizados quando necessário
- [ ] AGENTS.md atualizado se regras do projeto mudaram

## Riscos conhecidos

## Evidências de teste
```

## 2. Critério global de “done”

Uma tarefa só está concluída se:

```txt
1. compila;
2. passa nos testes;
3. preserva isolamento multiusuário;
4. não quebra export JSON/Markdown existente;
5. não introduz dependência externa obrigatória sem fallback;
6. não expõe segredos;
7. está documentada quando altera comportamento público.
```

## 3. Fase 0 — Governança, contrato e bootstrap documental

### PR-000 — Governança open source e documentação base

**Objetivo:** criar a base documental e regras do projeto antes de codar.

**Escopo:**

```txt
- README.md inicial
- LICENSE
- SECURITY.md
- CONTRIBUTING.md
- AGENTS.md
- docs/architecture.md
- docs/execution-plan.md
- docs/report-schema.md placeholder
```

**Checklist de implementação:**

```txt
- [x] Criar README com visão, escopo e não-objetivos
- [x] Definir licença inicial como AGPL-3.0-only, salvo decisão explícita diferente
- [x] Criar SECURITY.md com canal de disclosure
- [x] Criar CONTRIBUTING.md com fluxo de PR
- [x] Criar AGENTS.md na raiz
- [x] Criar docs/architecture.md
- [x] Criar docs/execution-plan.md
- [x] Criar docs/report-schema.md com schema ainda não definitivo
```

**Fora do escopo:** código de aplicação.

**Aceite:** repositório tem governança mínima e instruções para agentes.

---

### PR-001 — Monorepo TypeScript

**Objetivo:** criar monorepo com pnpm workspaces.

**Escopo:**

```txt
- package.json raiz
- pnpm-workspace.yaml
- tsconfig.base.json
- apps/web placeholder
- apps/api placeholder
- packages/core placeholder
- packages/types placeholder
- packages/strategies placeholder
- packages/reports placeholder
- packages/market-data placeholder
```

**Checklist de implementação:**

```txt
- [x] Criar estrutura de pastas
- [x] Configurar pnpm workspaces
- [x] Configurar TypeScript base
- [x] Criar scripts raiz: lint, typecheck, test, build
- [x] Adicionar Biome 2.x como formatter/linter/assist padrão
- [x] Fixar pnpm 11 no `packageManager`
- [x] Configurar `minimumReleaseAge` de 7 dias para installs do pnpm
- [x] Garantir que `pnpm install` funcione
- [x] Garantir que `pnpm typecheck` funcione sem erros
```

**Fora do escopo:** UI real, API real, banco.

**Aceite:** monorepo instala, compila placeholders e roda scripts base.

---

### PR-002 — Docker Compose e Postgres

**Objetivo:** preparar infraestrutura local com Postgres.

**Escopo:**

```txt
- docker-compose.yml
- serviço postgres
- .env.example
- healthcheck básico
```

**Checklist de implementação:**

```txt
- [x] Criar docker-compose.yml com Postgres
- [x] Criar volume persistente
- [x] Criar .env.example com DATABASE_URL
- [x] Documentar `docker compose up -d`
- [x] Criar script `pnpm db:status` ou equivalente
```

**Fora do escopo:** API conectar ao banco.

**Aceite:** Postgres sobe localmente e aceita conexão pela DATABASE_URL.

---

### PR-003 — Prisma e schema inicial

**Objetivo:** adicionar Prisma com schema mínimo.

**Escopo:**

```txt
- Prisma instalado
- schema.prisma
- migrations iniciais
- client gerado
```

**Checklist de implementação:**

```txt
- [x] Instalar Prisma
- [x] Criar schema com modelos mínimos: User/Auth conforme Better Auth será integrado depois ou placeholder compatível
- [x] Criar modelos Portfolio, Asset, Position, CashAccount
- [x] Amarrar tabelas filhas user-owned ao mesmo portfolio via FK composta `(portfolio_id, user_id)`
- [x] Criar migration inicial
- [x] Adicionar scripts db:generate, db:migrate, db:studio
- [x] Testar migration em banco limpo
```

**Fora do escopo:** Better Auth funcional.

**Aceite:** `pnpm db:migrate` cria as tabelas sem erro.

## 4. Fase 1 — Autenticação e base multiusuário

### PR-004 — Better Auth integrado à API

**Objetivo:** implementar autenticação robusta inicial.

**Escopo:**

```txt
- Better Auth configurado
- login local por e-mail e senha
- rotas de auth expostas sob /auth/*
- sessão via cookie
- usuário autenticado disponível na API
```

**Checklist de implementação:**

```txt
- [x] Configurar BETTER_AUTH_SECRET
- [x] Configurar BETTER_AUTH_URL
- [x] Integrar Better Auth ao NestJS
- [x] Configurar Better Auth com `basePath: "/auth"`
- [x] Montar handler Better Auth sob /auth/* antes do body parser JSON comum
- [x] Usar os modelos padrão do Better Auth como base do schema
- [x] Criar migration Prisma versionada para as tabelas de auth
- [x] Alinhar schema Better Auth com `users` via schema gerado ou model mapping + UUID
- [x] Criar helper de sessão que exponha `AuthenticatedUser { userId, email }`
- [x] Garantir cookies httpOnly
- [x] Configurar rate limiting no Better Auth para rotas de auth
- [x] Criar teste de login/logout/session
- [x] Rodar teste HTTP de auth contra Postgres real via Docker Compose
```

**Evidência local do corte:** teste HTTP real cobre `/auth/ok`, sign-up, sessão, `/me`,
logout e negativa pós-logout contra Postgres local. O workflow de quality gate sobe
Postgres efêmero e roda `pnpm db:deploy` antes da suíte.

**Fora do escopo:** OAuth social, 2FA, passkeys.

**Decisão de escopo:** PR-004 implementa apenas e-mail/senha local. OAuth, providers sociais e callbacks externos ficam fora do primeiro corte de auth.

**Decisão de UI:** PR-004 não implementa tela real de login. UI de auth deve vir em corte posterior consumindo o contrato HTTP já validado.

**Decisão de validação:** testes unitários podem mockar o helper de sessão, mas o fluxo HTTP de sign-up/sign-in/session/logout deve exercitar Better Auth, Prisma e Postgres reais.

**Decisão de boundary:** módulos de domínio não recebem o payload completo de sessão do Better Auth. O helper de sessão expõe somente `AuthenticatedUser { userId, email }`.

**Decisão de schema:** PR-004 usa o schema padrão do Better Auth como base e versiona a migration Prisma no repo, com o menor ajuste necessário para manter `users` como tabela canônica de **User**.

**Decisão de rate limit:** PR-004 usa rate limiting no escopo do Better Auth para rotas de auth. Política global de rate limit e hardening amplo continuam reservados para PR-023.

**Decisão de IP de cliente:** PR-004 normaliza o IP usado pelo Better Auth via Express antes do handler de auth. O padrão é `TRUST_PROXY_HOPS=0`; valores maiores só devem ser usados quando o reverse proxy for confiável e sanitizar headers encaminhados.

**Plano de execução paralela:** PR-004 pode ser executado com subagentes em workspaces separados, desde que os write scopes sejam disjuntos e o Codex principal integre o resultado. Divisão inicial:

```txt
1. schema/auth-config: Better Auth config, Prisma schema e migration versionada.
2. api-mount/session-helper: mount /auth/*, CORS com credenciais e helper AuthenticatedUser.
3. tests: testes unitários do helper e teste HTTP real de sign-up/sign-in/session/logout.
```

**Gates obrigatórios:** antes de abrir PR ou declarar pronto, rodar `agentic-testability-gate`, executar validação com Postgres real quando schema/auth forem tocados, e rodar `agentic-code-review` com exatamente um reviewer independente para o diff integrado.

**Aceite:** usuário consegue criar conta, logar, obter sessão e sair.

**Proibido:** implementar JWT manual paralelo sem decisão arquitetural.

---

### PR-005 — Portfolios escopados por usuário

**Objetivo:** criar CRUD de carteiras com isolamento por usuário.

**Escopo:**

```txt
- criar portfolio
- listar portfolios do usuário
- editar portfolio
- apagar portfolio vazio
```

**Checklist de implementação:**

```txt
- [x] Criar PortfoliosModule
- [x] Criar PortfolioRepository
- [x] Toda query recebe `userId`
- [x] Criar DTOs validados
- [x] Criar testes: usuário A não acessa portfolio do usuário B
- [x] Atualizar OpenAPI ou docs de endpoints
```

**Fora do escopo:** posições, ativos, relatórios.

**Aceite:** isolamento multiusuário testado.

**Evidência local do corte:** teste HTTP real cobre autenticação obrigatória,
validação de DTOs, criação/listagem/leitura/edição/delete de portfolio vazio e
negativas de acesso cruzado entre usuários contra Postgres local.

---

### PR-006 — Assets e classificações

**Objetivo:** criar cadastro de ativos e metadados.

**Escopo:**

```txt
- assets globais
- busca por ticker
- classificação básica
- user asset overrides
```

**Checklist de implementação:**

```txt
- [x] Criar AssetsModule
- [x] Criar tabela assets se ainda não existir
- [x] Criar tabela user_asset_overrides
- [x] Implementar busca por ticker
- [x] Permitir classificação: paper, hybrid, brick, cash, stock, etf, other
- [x] Permitir segmento: logística, renda urbana, lajes, shopping, recebíveis etc.
- [x] Criar seeds mínimos para testes
```

**Fora do escopo:** provider externo de cotações.

**Aceite:** usuário consegue cadastrar/ajustar metadados de ativos sem afetar outros usuários.

**Evidência local do corte:** teste HTTP real cobre autenticação obrigatória,
validação de DTOs, identidade canônica global de ticker/exchange/currency, busca
por ticker, limite de paginação e overrides de metadados isolados por usuário
contra Postgres local. A tabela `assets` já existia no schema inicial; o corte
adiciona `custom_asset_type` em `user_asset_overrides` para evitar que
classificação subjetiva de um usuário altere o catálogo global.

---

### PR-007 — Positions MVP

**Objetivo:** permitir cadastro manual da carteira atual.

**Escopo:**

```txt
- criar posição
- editar quantidade
- editar preço médio opcional
- editar preço manual opcional
- listar posições com valor calculado
```

**Checklist de implementação:**

```txt
- [x] Criar PositionsModule
- [x] Criar PositionRepository com userId obrigatório
- [x] Validar quantity > 0
- [x] Validar preços >= 0
- [x] Calcular totalValue = quantity * currentPrice
- [x] Usar manual_current_price se não houver snapshot externo
- [x] Testar isolamento por usuário
```

**Fora do escopo:** ledger de transações, IR, importação.

**Aceite:** usuário cadastra CYCR11, WHGR11 ou qualquer ativo manualmente e vê valor calculado.

**Evidência local do corte:** teste HTTP real cobre autenticação obrigatória,
validação de DTOs, criação/listagem/edição de posições, bloqueio de acesso
cruzado a portfolio/position e cálculo de `totalValue` a partir de
`manualCurrentPrice` contra Postgres local.

---

### PR-008 — Cash accounts

**Objetivo:** permitir cadastro de caixa, como CDB liquidez diária.

**Escopo:**

```txt
- criar conta de caixa
- editar saldo
- classificar tipo e liquidez
- incluir no snapshot
```

**Checklist de implementação:**

```txt
- [x] Criar CashAccountsModule
- [x] Criar CashAccountRepository
- [x] Campos: name, type, balance, liquidity, benchmark, benchmarkPercent
- [x] Validar balance >= 0
- [x] Incluir caixa no cálculo de alocação
```

**Fora do escopo:** atualização automática de CDI ou rentabilidade do CDB.

**Aceite:** caixa aparece separado da carteira de ativos.

**Evidência local do corte:** teste HTTP real cobre autenticação obrigatória,
validação de DTOs, criação/listagem/edição de cash accounts, bloqueio de acesso
cruzado a portfolio/cash account e listagem de caixa separada de posições contra
Postgres local. Teste do pacote core cobre inclusão de cash accounts no total e
no bucket `cash` de alocação.

## 5. Fase 2 — Estratégias e recorrência

### PR-009 — Strategy engine

**Objetivo:** implementar estratégias fixas e cálculo de alertas.

**Escopo:**

```txt
- low_maintenance
- high_income
- balanced_growth
- opportunistic
- defensive
- avaliação de limites
- alertas
```

**Checklist de implementação:**

```txt
- [x] Criar packages/strategies
- [x] Criar tipos Strategy, StrategyRule, StrategyAlert
- [x] Criar função evaluateStrategy(portfolio, strategy)
- [x] Alertar maxSingleAssetPercent
- [x] Alertar maxPaperHybridPercent
- [x] Alertar maxSectorPercent
- [x] Alertar reportIntervalDays
- [x] Testes unitários para cada estratégia
```

**Fora do escopo:** sugestão exata de compra.

**Aceite:** dado um portfolio fixture, o motor retorna alertas determinísticos.

**Evidência local do corte:** teste unitário do pacote `strategies` cobre as
cinco estratégias MVP, cadência de relatório, limites por ativo, papel+híbrido,
setor, caixa mínimo, tijolo mínimo e flags de revisão/checklist sem gerar
instrução automática de compra ou venda. Os códigos/severidades dos alertas são
contratos tipados exportados por `@decision-board/types`.

---

### PR-010 — Contribution plans

**Objetivo:** cadastrar recorrência de aporte.

**Escopo:**

```txt
- aporte mensal recorrente
- dia do mês
- estratégia padrão
- conta de caixa padrão
- ativo/inativo
```

**Checklist de implementação:**

```txt
- [x] Criar ContributionPlansModule
- [x] Campos: amount, frequency, dayOfMonth, startsAt, endsAt, defaultStrategyId
- [x] Validar amount > 0
- [x] Validar dayOfMonth 1..31
- [x] Listar planos ativos
- [x] Exibir próximo ciclo previsto
```

**Fora do escopo:** job automático criando ciclos.

**Aceite:** usuário define aporte recorrente de R$ 1.000/mês ou outro valor.

**Evidência local do corte:** API autenticada cria, lista planos ativos e
atualiza planos de aporte mensal com isolamento por usuário, validação de valor
positivo, dia do mês, datas, estratégia padrão e conta de caixa opcional do
mesmo portfolio. O próximo ciclo previsto é calculado na resposta; criação
automática de ciclos fica para o PR-011/PR-012.

---

### PR-011 — Contribution cycles

**Objetivo:** materializar ciclos de aporte por mês.

**Escopo:**

```txt
- criar ciclo manualmente
- confirmar valor aportado
- status do ciclo
- vincular estratégia
```

**Checklist de implementação:**

```txt
- [x] Criar ContributionCyclesModule
- [x] Criar ciclo pendente a partir de um ContributionPlan
- [x] Permitir confirmedAmount diferente do plannedAmount
- [x] Status: pending, confirmed, skipped, reported, closed
- [x] Testar isolamento por usuário
```

**Fora do escopo:** job recorrente automático.

**Aceite:** usuário abre ciclo de maio, confirma aporte de R$ 1.200 e escolhe estratégia.

**Evidência local do corte:** API autenticada cria ciclo mensal manual a partir
de um plano, lista ciclos por portfolio e confirma valor aportado diferente do
planejado com estratégia escolhida. A tabela usa FK composta para manter o ciclo
no mesmo usuário/portfolio do plano; job recorrente automático fica no PR-012.

---

### PR-012 — Jobs com pg-boss

**Objetivo:** adicionar jobs para ciclos e lembretes.

**Escopo:**

```txt
- pg-boss configurado
- job para criar ciclos mensais
- job para marcar relatório recomendado vencido
```

**Checklist de implementação:**

```txt
- [ ] Configurar pg-boss usando Postgres existente
- [ ] Criar job createMonthlyContributionCycles
- [ ] Criar job checkReportDue
- [ ] Garantir idempotência por mês/plano
- [ ] Testar execução local
```

**Fora do escopo:** notificações por e-mail.

**Aceite:** jobs podem rodar sem duplicar ciclos.

## 6. Fase 3 — Market data

### PR-013 — Market data provider interface + manual provider

**Objetivo:** criar camada de provider extensível.

**Escopo:**

```txt
- interface MarketDataProvider
- manual provider
- price snapshots
```

**Checklist de implementação:**

```txt
- [ ] Criar packages/market-data
- [ ] Definir QuoteSnapshot
- [ ] Criar ManualMarketDataProvider
- [ ] Criar endpoint para salvar preço manual
- [ ] Criar price_snapshots
- [ ] Não depender de provider externo
```

**Fora do escopo:** brapi.

**Aceite:** usuário atualiza preço manual e snapshot é salvo.

---

### PR-014 — brapi provider

**Objetivo:** adicionar brapi como provider configurável.

**Escopo:**

```txt
- usar BRAPI_TOKEN opcional
- buscar cotação por ticker
- salvar snapshot
- fallback para manual em caso de falha
```

**Checklist de implementação:**

```txt
- [ ] Implementar BrapiMarketDataProvider
- [ ] Configurar timeout
- [ ] Tratar rate limit/erro sem quebrar app
- [ ] Salvar provider e capturedAt
- [ ] Adicionar testes com mock HTTP
- [ ] Documentar limitações de plano/token
```

**Fora do escopo:** dividendos de FIIs, relatórios CVM.

**Aceite:** botão “Atualizar snapshot” busca preços via brapi quando configurada.

---

### PR-015 — Atualização manual de snapshot

**Objetivo:** criar endpoint e UI para atualizar snapshot de preços.

**Escopo:**

```txt
- botão atualizar
- status da atualização
- erro legível
- data da última atualização
```

**Checklist de implementação:**

```txt
- [ ] Endpoint POST /portfolios/:id/market-data/refresh
- [ ] UI com botão
- [ ] Exibir provider usado
- [ ] Exibir última atualização
- [ ] Exibir falhas por ativo
```

**Fora do escopo:** atualização automática em background.

**Aceite:** usuário atualiza preços quando desejar.

## 7. Fase 4 — Dashboard e relatórios

### PR-016 — Core calculations

**Objetivo:** centralizar cálculos de carteira.

**Escopo:**

```txt
- valor total
- peso por ativo
- alocação por categoria
- alocação por segmento
- dividendos estimados, se informados
```

**Checklist de implementação:**

```txt
- [ ] Criar calculatePortfolioSummary
- [ ] Criar calculateAllocation
- [ ] Criar calculateEstimatedDividends
- [ ] Criar fixtures
- [ ] Testar arredondamento
- [ ] Testar carteira vazia
```

**Fora do escopo:** sugestões de compra.

**Aceite:** cálculos são reproduzíveis e testados.

---

### PR-017 — Dashboard web MVP

**Objetivo:** criar tela principal útil.

**Escopo:**

```txt
- valor total
- caixa
- aporte do mês
- dividendos estimados
- estratégia ativa
- alertas
- gráfico simples de alocação
```

**Checklist de implementação:**

```txt
- [ ] Criar layout base
- [ ] Criar dashboard de portfolio
- [ ] Integrar TanStack Query
- [ ] Exibir skeleton/loading
- [ ] Exibir empty state claro
- [ ] Garantir responsividade básica
```

**Fora do escopo:** gráficos avançados.

**Aceite:** usuário consegue entender a carteira em até 10 segundos.

---

### PR-018 — Report engine Markdown

**Objetivo:** gerar relatório humano.

**Escopo:**

```txt
- packages/reports
- Markdown generator
- conteúdo mínimo do relatório
```

**Checklist de implementação:**

```txt
- [ ] Criar generateMarkdownReport(snapshot)
- [ ] Incluir estratégia
- [ ] Incluir aporte
- [ ] Incluir caixa
- [ ] Incluir posições
- [ ] Incluir alocação
- [ ] Incluir alertas
- [ ] Incluir frequência recomendada
- [ ] Teste snapshot fixture -> markdown esperado
```

**Fora do escopo:** PDF.

**Aceite:** relatório Markdown é legível e exportável.

---

### PR-019 — Report engine JSON + schema

**Objetivo:** gerar snapshot estruturado para IA.

**Escopo:**

```txt
- JSON generator
- schemaVersion
- JSON Schema
- export endpoint
```

**Checklist de implementação:**

```txt
- [ ] Criar generateJsonReport(snapshot)
- [ ] Definir schemaVersion = "1.0"
- [ ] Criar docs/report-schema.md
- [ ] Validar JSON contra schema
- [ ] Remover dados sensíveis do payload
- [ ] Testar com fixtures
```

**Fora do escopo:** integração com IA dentro do app.

**Aceite:** JSON exportado é estável, versionado e sem PII desnecessária.

---

### PR-020 — Histórico de relatórios

**Objetivo:** armazenar relatórios gerados.

**Escopo:**

```txt
- reports table
- listagem
- download/copiar markdown
- download/copiar JSON
```

**Checklist de implementação:**

```txt
- [ ] Salvar relatório no banco
- [ ] Listar relatórios por portfolio
- [ ] Mostrar data, estratégia e alertas principais
- [ ] Permitir copiar conteúdo
- [ ] Testar isolamento por usuário
```

**Fora do escopo:** comparação entre relatórios.

**Aceite:** usuário consegue recuperar relatório anterior.

## 8. Fase 5 — UX de aporte e estratégia

### PR-021 — Tela de aporte do mês

**Objetivo:** guiar decisão operacional mensal.

**Escopo:**

```txt
- mostrar ciclo atual
- aporte planejado
- aporte confirmado
- estratégia
- caixa disponível
- gerar snapshot/relatório
```

**Checklist de implementação:**

```txt
- [ ] Criar tela ContributionCycle
- [ ] Permitir editar confirmedAmount
- [ ] Permitir escolher estratégia no ciclo
- [ ] Mostrar próxima revisão recomendada
- [ ] Botão gerar relatório
```

**Fora do escopo:** sugestão automática de compras.

**Aceite:** usuário executa o fluxo mensal sem sair da tela.

---

### PR-022 — Alertas por estratégia na UI

**Objetivo:** tornar estratégia operacional.

**Escopo:**

```txt
- cards de estratégia
- explicação de risco
- frequência recomendada
- alertas visuais
```

**Checklist de implementação:**

```txt
- [ ] Criar cards das estratégias
- [ ] Mostrar reportIntervalDays
- [ ] Mostrar regras principais
- [ ] Mostrar aviso para estratégias de maior risco
- [ ] Mostrar por que relatório deve ser mensal/quinzenal/semanal
```

**Fora do escopo:** custom strategy builder.

**Aceite:** usuário entende o custo operacional de cada estratégia.

## 9. Fase 6 — Hardening open source

### PR-023 — Segurança básica de produção

**Objetivo:** preparar para uso externo controlado.

**Escopo:**

```txt
- rate limit
- secure headers
- CORS restrito
- logging seguro
- backup docs
```

**Checklist de implementação:**

```txt
- [ ] Rate limit em auth
- [ ] Rate limit em endpoints de provider externo
- [ ] CORS baseado em WEB_ORIGIN
- [ ] Helmet ou headers equivalentes
- [ ] Logs sem tokens, cookies ou payload sensível
- [ ] Documentar HTTPS obrigatório
- [ ] Documentar backup do Postgres
```

**Fora do escopo:** RLS.

**Aceite:** app pode ser hospedado com risco reduzido.

---

### PR-024 — CI/CD básico

**Objetivo:** impedir regressões comuns.

**Escopo:**

```txt
- GitHub Actions
- lint
- typecheck
- test
- build
```

**Checklist de implementação:**

```txt
- [ ] Criar workflow CI
- [ ] Rodar pnpm install com cache
- [ ] Rodar lint
- [ ] Rodar typecheck
- [ ] Rodar tests
- [ ] Rodar build
```

**Fora do escopo:** deploy automático.

**Aceite:** PRs quebradas falham automaticamente.

---

### PR-025 — Segurança open source

**Objetivo:** adicionar práticas de segurança para projeto público.

**Escopo:**

```txt
- Dependabot/Renovate
- CodeQL
- OpenSSF Scorecard action opcional
- SECURITY.md refinado
```

**Checklist de implementação:**

```txt
- [ ] Configurar Dependabot ou Renovate
- [ ] Configurar CodeQL para TS
- [ ] Adicionar OpenSSF Scorecard se adequado
- [ ] Revisar SECURITY.md
- [ ] Garantir que secrets não rodam em PRs não confiáveis
```

**Fora do escopo:** auditoria externa.

**Aceite:** projeto tem rotina mínima de segurança open source.

## 10. Fase 7 — Evoluções posteriores

### PR-026 — Transaction ledger

**Objetivo:** permitir posição derivada de transações.

**Escopo:**

```txt
- compras
- vendas
- taxas
- preço médio
- alternância simple mode / ledger mode
```

**Checklist de implementação:**

```txt
- [ ] Criar TransactionsModule
- [ ] Implementar cálculo de posição derivada
- [ ] Não quebrar positions MVP
- [ ] Permitir migração manual de simple mode para ledger mode
- [ ] Testar compra, venda parcial, venda total
```

**Fora do escopo:** IR completo.

**Aceite:** usuário pode usar ledger sem perder modo simples.

---

### PR-027 — Importação CSV

**Objetivo:** reduzir entrada manual.

**Escopo:**

```txt
- upload CSV
- mapeamento de colunas
- preview antes de importar
- importação idempotente quando possível
```

**Checklist de implementação:**

```txt
- [ ] Criar parser seguro
- [ ] Limitar tamanho de arquivo
- [ ] Criar preview
- [ ] Exigir confirmação antes de gravar
- [ ] Não aceitar formatos executáveis
```

**Fora do escopo:** login automático em corretoras.

**Aceite:** usuário importa dados sem expor credenciais.

---

### PR-028 — Proposal engine

**Objetivo:** sugerir cestas simuladas de aporte sem prescrição financeira.

**Escopo:**

```txt
- simular compra com aporte disponível
- respeitar estratégia
- respeitar bloqueios do usuário
- explicar trade-offs
```

**Checklist de implementação:**

```txt
- [ ] Criar ProposalEngine
- [ ] Entrada: portfolio, strategy, contributionAmount, eligibleAssets
- [ ] Saída: proposal com rationale
- [ ] Linguagem: simulação, não recomendação definitiva
- [ ] Testar limites por ativo/categoria
```

**Fora do escopo:** ordem automática, integração com corretora.

**Aceite:** app sugere cenários explicáveis e não executa nada.

## 11. Checklist recorrente para cada nova feature

Antes de implementar:

```txt
- [ ] A feature pertence ao MVP ou está explicitamente no roadmap?
- [ ] Existe modelo de dados claro?
- [ ] Existe risco de recomendação financeira indevida?
- [ ] Existe risco de vazamento de dados?
- [ ] Existe fallback se provider externo falhar?
```

Durante implementação:

```txt
- [ ] Validar inputs
- [ ] Escopar por userId
- [ ] Escrever testes de domínio
- [ ] Escrever testes de isolamento quando envolver usuário
- [ ] Não logar dados sensíveis
```

Antes de finalizar:

```txt
- [ ] lint passou
- [ ] typecheck passou
- [ ] testes passaram
- [ ] build passou
- [ ] docs atualizadas
- [ ] PR descreve riscos e limitações
```

## 12. Checklist de mudança de schema

Toda mudança de schema exige:

```txt
- [ ] migration Prisma
- [ ] descrição da mudança
- [ ] teste em banco limpo
- [ ] teste em banco com dados existentes quando aplicável
- [ ] nenhum dado apagado sem confirmação explícita
- [ ] atualizar docs/modelagem se público
```

## 13. Checklist de segurança

```txt
- [ ] endpoint exige autenticação quando necessário
- [ ] endpoint usa userId da sessão
- [ ] endpoint não aceita userId arbitrário do body
- [ ] CORS não está aberto em produção
- [ ] segredo não aparece em log
- [ ] payload de relatório não inclui PII desnecessária
- [ ] upload, se houver, tem limite de tamanho e tipo
```

## 14. Checklist de release

```txt
- [ ] migrations aplicadas em staging/local prod-like
- [ ] backup testado antes de deploy em produção
- [ ] variáveis de ambiente revisadas
- [ ] changelog atualizado
- [ ] versão marcada
- [ ] rollback conhecido
```

## 15. Padrão de nomenclatura

```txt
Branches:
feature/pr-009-strategy-engine
fix/auth-cookie-domain
chore/ci-basic

Commits:
feat(strategies): add low maintenance strategy
fix(auth): restrict cors origin
chore(db): add initial prisma migration
```

## 16. Critérios de rejeição automática

Uma PR deve ser rejeitada se:

```txt
- cria scraping da B3/corretora;
- armazena credencial de corretora;
- mistura JWT manual com Better Auth sem decisão aprovada;
- consulta dados de carteira sem userId;
- muda schema sem migration;
- adiciona provider externo obrigatório sem fallback manual;
- transforma alerta em recomendação financeira prescritiva;
- remove ou enfraquece testes de isolamento;
- expõe token, cookie ou payload sensível em logs.
```
