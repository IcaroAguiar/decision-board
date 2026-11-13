# Ferramentas para análise de investimentos

**Consulta:** 2026-10-24. **Status:** pesquisa documental e proposta para discussão.

**Priorização revista em 2026-10-25:** o usuário confirmou as análises avançadas
como parte central da primeira versão útil do Ascend Compass. O escopo e os
critérios de aceite estão no [plano do produto](../product-plan.md).

Esta nota descreve referências e ferramentas possíveis para o Decision Board. Não implementa integrações nem altera o contrato arquitetural vigente. Nenhum dos sistemas foi instalado, executado ou auditado nesta pesquisa.

## Referências comparáveis

- **OpenBB:** expõe rotas como ferramentas MCP; o catálogo depende das extensões instaladas. Permite restringir categorias, inclusive nas chamadas indiretas, e alguns provedores exigem credenciais próprias. O padrão aproveitável é oferecer dados e ferramentas com permissões explícitas. [Documentação V5](https://docs.openbb.co/odp/python/extensions/interface/openbb-mcp).
- **Portfolio Performance:** documenta rentabilidade ponderada pelo dinheiro, considerando datas e valores dos fluxos. [IRR e fluxos](https://help.portfolio-performance.info/en/concepts/performance/money-weighted/). Também documenta TTWROR, que neutraliza aportes e retiradas, com convenções e aproximações explícitas. O precedente é separar aumento do patrimônio, retorno dos investimentos e efeito dos aportes. [Metodologia TTWROR](https://help.portfolio-performance.info/en/concepts/performance/time-weighted/).
- **Ghostfolio:** anuncia múltiplas contas, transações, importação/exportação e análise estática para identificar riscos potenciais. [README](https://github.com/ghostfolio/ghostfolio#features). A evidência encontrada sobre um rebalanceador descreve uma extensão comunitária separada; não comprova um otimizador nativo. [Discussão no repositório](https://github.com/ghostfolio/ghostfolio/discussions/7624). Podemos aproveitar a análise por regras sem atribuir recursos não comprovados ao produto.
- **FinRobot:** os autores declaram separar cálculo financeiro por código da síntese feita pelo LLM, incluindo instrumentos de valuation e simulação. O rótulo de produção atribuído a uma versão não representa auditoria independente. [README](https://github.com/AI4Finance-Foundation/FinRobot). O artigo original descreve uma arquitetura de pesquisa, sem validar automaticamente versões posteriores. [Artigo dos autores](https://arxiv.org/abs/2405.14767v2). O precedente é manter números reproduzíveis e usar a IA para investigar, interpretar e explicar.

São referências de desenho. A pesquisa não verificou a eficácia financeira nem a segurança operacional desses sistemas.

## Fontes candidatas no Brasil

- **brapi:** documenta cotações, histórico, proventos e dados financeiros. Autenticação e acesso variam conforme os recursos e o plano. A chave da IA não substitui a de um provedor de dados. [Documentação](https://brapi.dev/docs/acoes).
- **CVM:** publica [demonstrações financeiras padronizadas](https://dados.cvm.gov.br/dataset/cia_aberta-doc-dfp) e [informes mensais de FIIs](https://dados.cvm.gov.br/dataset/fii-doc-inf_mensal). A ingestão proposta deve preservar período de referência, publicação e reapresentações.
- **Banco Central:** disponibiliza a meta Selic pelo SGS, com unidade e recursos JSON/CSV documentados. Cada série adicional precisa ter metodologia e unidade verificadas. [Série oficial de exemplo](https://dadosabertos.bcb.gov.br/dataset/432-taxa-de-juros---meta-selic-definida-pelo-copom).

Não foram validados conectividade, cobertura nem custos. O cadastro manual permanece uma alternativa necessária. Cada classe de investimento depende de fontes e métodos adequados a ela.

## Catálogo proposto

Os nomes são ilustrativos; não representam ferramentas implementadas.

| Grupo | Exemplos | Resultado esperado |
| --- | --- | --- |
| Contexto | `get_portfolio_snapshot`, `get_strategy`, `get_monthly_budget` | Posições, movimentos, caixa, reserva, objetivos e restrições; aponta lacunas. |
| Mercado | `get_quotes`, `get_price_history`, `get_corporate_events`, `get_macro_series` | Dados com fonte, data, moeda e unidade; detecta vencimento ou divergência. |
| Evidências | `search_documents`, `read_document`, `get_asset_fundamentals` | Documentos e indicadores vinculados às afirmações e aos períodos correspondentes. |
| Descoberta | `screen_investments`, `compare_assets` | Candidatos compatíveis com a estratégia; critérios e cobertura explícitos. |
| Cálculos | `calculate_returns`, `calculate_risk` | Retorno, renda, correlações, volatilidade, drawdown e contribuição ao risco; métodos com dados suficientes. |
| Cenários | `optimize_allocation`, `simulate_contribution`, `simulate_reallocation`, `backtest_strategy`, `stress_test`, `simulate_goals` | Otimização, testes históricos, estresse e Monte Carlo; comparação de alternativas com orçamento, reserva, custos e lotes explícitos. |
| Viabilidade | `check_proposal_constraints` | Confere recursos disponíveis e a versão da estratégia. |
| Continuidade | `save_analysis`, `compare_analyses`, `create_review_alert` | Evidências, resultados, versões, decisões e mudanças relevantes. |

O agente pode consultar a viabilidade, mas a validação final deve executar obrigatoriamente no servidor antes de apresentar uma proposta como válida. Aplicação, CLI e rotinas devem compartilhar permissões e restrições.

## Anthropic e controles propostos

Nas ferramentas executadas pelo cliente, a aplicação recebe a solicitação e controla sua execução. [Contrato de ferramentas](https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works). O modo estrito restringe nomes e argumentos ao schema. A conformidade de formato não demonstra autorização, veracidade ou adequação financeira. [Strict tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use).

A busca web oferece citações, filtros de domínio e limites de buscas. [Documentação](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool). Documentos externos podem conter instruções maliciosas; a orientação oficial recomenda separá-los das instruções da aplicação e limitar privilégios. [Prompt injection](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks).

Propomos:

1. Derivar o acesso da sessão autenticada; o modelo não escolhe o proprietário dos dados. Manter credenciais fora das mensagens e dos registros de análise.
2. Distinguir dados informados, observados e estimados, sempre com fonte e data.
3. Calcular por código verificável e guardar entradas, resultados e versões. Explicitar quando faltarem movimentos ou avaliações para medir rentabilidade.
4. Bloquear ou qualificar conclusões com dados vencidos, divergentes ou sem evidência. Uma lacuna não pode virar um indicador favorável.
5. Verificar no servidor orçamento, reserva, lotes, concentração e estratégia. Definir precisão monetária e arredondamento; a saída do modelo não dispensa verificação.
6. Expor premissas de custos e tributos. Manter questões sem cobertura validada como pendências e distinguir estimativas de valores confirmados.
7. Separar pesquisa e alterações de estado. Mudanças sensíveis exigem confirmação vinculada à proposta e revalidação dos dados. Execução em corretora continua uma possibilidade sem decisão de implementação.
8. Limitar buscas, chamadas, duração e gasto. Registrar ferramentas utilizadas e justificativa final para revisão posterior.

## Primeira entrega e verificação

A primeira versão útil deve combinar contexto, dados rastreáveis, pesquisa documental e descoberta com risco avançado, otimização, backtests, testes de estresse e Monte Carlo. Sua aceitação depende da jornada completa definida no plano, com casos de referência e resultados numéricos reproduzíveis. Entregas intermediárias de infraestrutura e cálculos básicos não satisfazem esse aceite.

Precisamos provar que o orçamento não é excedido, a reserva é preservada conforme sua finalidade, lotes e restrições são respeitados, aportes não aparecem como lucro, eventos não são contados duas vezes e lacunas são explicitadas. Conteúdo malicioso não pode obter permissões, e alterações sensíveis precisam de autorização válida.

Backtests precisam respeitar a informação disponível em cada data, custos, premissas de execução e vieses da seleção de ativos. Eles avaliam uma estratégia e não substituem o histórico pessoal de movimentações. Monte Carlo registra modelo, hipóteses, semente e parâmetros; faixas simuladas representam resultados condicionados às hipóteses. Sensibilidade e cobertura devem acompanhar cada conclusão.

Python é o principal candidato para o motor analítico, com TypeScript na aplicação e na coordenação. Bibliotecas como [PyPortfolioOpt](https://pyportfolioopt.readthedocs.io/en/latest/UserGuide.html) e [VectorBT](https://vectorbt.dev/api/portfolio/base/) são candidatas para avaliação, sem instalação ou validação nesta pesquisa. A documentação do PyPortfolioOpt explicita a [incerteza das estimativas de retorno](https://pyportfolioopt.readthedocs.io/en/latest/ExpectedReturns.html). P0 precisa avaliar licenças, métodos, fontes, cobertura brasileira e integração antes de escolher dependências.

**Não verificado:** execução das integrações, precisão dos cálculos, segurança operacional, licenças e custos, cobertura completa por classe, atualização de contas financeiras e produção. Não houve uso de contas financeiras reais, credenciais nem dados de carteira.
