# Plano do produto e da retomada

**Atualização:** 2026-11-13. **Produto:** Decision Board.

Este plano consolida a discussão da nova visão e propõe unidades de execução.
O design permanece em definição. Nenhuma unidade de implementação abaixo está concluída por constar neste
documento.

O [plano anterior](execution-plan.md) permanece como histórico. O primeiro passo
técnico é reconciliar esta visão com o código e com os contratos vigentes.

## Visão definida na conversa

O produto começa para uso pessoal e poderá receber outras pessoas com suas
próprias carteiras, estratégias e configurações de IA. A integração inicial de
IA utiliza uma chave da Anthropic fornecida pelo usuário.

O Decision Board é um aplicativo independente. Backend, dados e autorização
têm fronteiras próprias; uma integração futura com outro sistema deverá
explicitar quais informações compartilha.

A IA ajuda a construir a estratégia, acompanha a carteira, pesquisa novas
possibilidades e apresenta propostas fundamentadas. Essas propostas podem
envolver manter posições, destinar o próximo aporte, realocar recursos, avaliar
uma venda ou revisar a estratégia. A estratégia determina as classes elegíveis.

O produto deve oferecer uma aplicação web e uma CLI para consultas e operações.
Ambas precisam usar as mesmas capacidades, permissões e validações.

As decisões discutidas são:

- Acompanhar posições e recursos em instituições distintas, preservando a
  finalidade de cada valor.
- Distinguir a reserva de emergência do dinheiro disponível para investir.
- Usar um orçamento mensal de aporte definido pelo usuário.
- Permitir registro manual de posições e movimentações quando a sincronização
  automática não estiver disponível.
- Atualizar cotações independentemente do acesso à conta financeira, conforme
  a cobertura de fontes validadas.
- Distinguir dados informados, observados e estimados, com origem e data.
- Pesquisar investimentos ainda ausentes da carteira quando puderem melhorar
  o alinhamento aos objetivos e às restrições da estratégia.
- Explicar as propostas com evidências, premissas, riscos, custos e incertezas.
- Usar cálculos reproduzíveis e validação obrigatória fora do modelo.

Uma classe elegível não ganha análise completa automaticamente. O sistema
precisa indicar quando faltarem fontes, histórico ou métodos adequados.

## Diferencial e critério da primeira versão útil

Em 2026-10-25, o usuário confirmou que análises avançadas fazem parte do
diferencial do Decision Board. A primeira versão útil precisa oferecer uma jornada
completa de decisão apoiada nessas análises. Simplificar a implementação não
justifica adiar as capacidades centrais do produto.

O escopo analítico inclui as capacidades abaixo. P0 deve definir métodos,
fontes, classes cobertas e critérios numéricos de validação para cada uma.

| Capacidade | Pergunta que deve ajudar a responder | Evidência de aceite |
| --- | --- | --- |
| Risco e diversificação | Quais exposições e relações entre ativos concentram o risco? | Correlação, volatilidade, drawdown e contribuição ao risco calculados sobre uma base identificada, com limites da cobertura. |
| Otimização sob restrições | Como comparar destinos para o aporte ou uma realocação? | Alternativas comparáveis a manter a carteira, respeitando orçamento, reserva, liquidez, lotes, custos e estratégia; inviabilidade explícita. |
| Backtests e testes de estresse | Como a estratégia se comporta em diferentes períodos e condições adversas? | Regras, períodos, dados disponíveis em cada data, custos e premissas de execução registrados; comparação com uma referência pertinente. |
| Monte Carlo e sensibilidade | Como aporte, prazo e hipóteses afetam a distribuição de resultados para uma meta? | Modelo, hipóteses, parâmetros, semente e configuração das simulações registrados; resultados apresentados como cenários condicionados às hipóteses. |

Cada resultado deve preservar entradas, origem dos dados, versões dos métodos
e limitações. O backtest de uma estratégia não representa a rentabilidade
pessoal do usuário. Histórico pessoal incompleto permanece identificado como
tal. Uma lacuna impede a conclusão afetada e continua como pendência de aceite
quando comprometer uma capacidade central da jornada acordada.

As fases abaixo organizam construção e verificação. A conclusão de uma fase
de infraestrutura ou de cálculos básicos não basta para declarar o produto
pronto. O aceite exige a jornada avançada integrada, tanto pela web quanto
pela CLI, incluindo pesquisa, comparação, explicação e decisão registrada.

### Direção técnica

Decisões de 2026-11-10 a 2026-11-13:

- O Decision Board é hospedado, como um SaaS, sobre a stack vigente (Better Auth,
  NestJS, Prisma com Postgres e `pg-boss`).
- As posições vêm dos arquivos que a pessoa baixa na Área do Investidor da B3.
  O caixa para aporte é declarado no app. A Pluggy não faz parte do Decision Board.
  Detalhes no [plano de fontes de dados](plan/2026-11-10-fontes-de-dados.md).
- O motor analítico é TypeScript, em `packages/core`, puro e testado. Os
  requisitos R1 a R10 de [analysis-requirements.md](analysis-requirements.md)
  usam álgebra que não exige bibliotecas numéricas. Python só volta à pauta se
  Monte Carlo ou a otimização exigirem.
- A IA investiga e interpreta; os métodos numéricos executam em código
  verificável.

## Primeira jornada a entregar

```text
Configurar a IA e seus limites de uso
  → cadastrar carteira, reserva e dados iniciais
  → construir e aprovar uma estratégia com a IA
  → definir o orçamento mensal
  → obter dados e evidências com fonte e data
  → avaliar risco, otimizar alternativas e testar sua robustez
  → comparar carteira atual, próximo aporte, realocação e metas
  → receber uma proposta validada e suas limitações
  → aprovar, ajustar, adiar ou rejeitar a proposta
  → acompanhar decisões, movimentações e novas análises
```

As primeiras análises devem funcionar sob demanda. A rotina ativa entra depois
de validarmos essa jornada e configurarmos permissões e limites de gasto.
Aprovar um cenário não significa registrar uma operação financeira como
executada. O registro precisa refletir o que o usuário efetivamente fez.

## Ferramentas e controles incorporados ao plano

Os grupos que orientam a implementação são:

| Grupo | Capacidade | Condição para uso |
| --- | --- | --- |
| Contexto | Carteira, reserva, estratégia e orçamento | Identidade autenticada e lacunas explícitas. |
| Mercado | Cotações, histórico, eventos e séries macroeconômicas | Fonte, data, moeda e unidade verificáveis. |
| Evidências | Busca e leitura de documentos e fundamentos | Afirmações vinculadas ao documento e ao período. |
| Descoberta | Seleção e comparação de novos candidatos | Critérios da estratégia e cobertura da pesquisa explícitos. |
| Cálculos | Valor, retorno, renda, correlações e contribuição ao risco | Código validado e histórico suficiente para cada método. |
| Cenários | Otimização de aporte e realocação, backtests, estresse e Monte Carlo | Métodos e hipóteses registrados; orçamento, reserva, lotes e restrições respeitados. |
| Viabilidade | Verificação da proposta | Validação final obrigatória no servidor. |
| Continuidade | Histórico, comparação e alertas | Versões, evidências, decisões e custo de uso registrados. |

As credenciais ficam fora do contexto do modelo, das saídas das ferramentas e
dos registros de análise. Documentos externos são dados sem autoridade para
alterar permissões. A aplicação precisa controlar o que pode ser executado.

## Sequência proposta de execução

Cada unidade termina em uma evidência verificável e pode ser dividida em PRs
menores. As verificações acompanham as entregas, sem esperar a última fase.

| Unidade | Entrega | Dependência | Evidência de aceite |
| --- | --- | --- | --- |
| P0 — Contrato e inventário | Alinhar arquitetura e regras à visão aprovada; avaliar código, WIP, PRs, motor analítico e cobertura inicial de métodos e dados. | Este plano. | Decisões e conflitos registrados; trabalho anterior preservado; responsabilidades de TypeScript e Python avaliadas; métodos, fontes e critérios de aceite definidos. |
| P1 — Carteira e finalidade | Posições, movimentações necessárias, reserva, caixa, orçamento mensal e contrato da estratégia versionada. | P0. | Dados salvos e recuperados com isolamento; reserva distinguida do orçamento; histórico incompleto identificado. |
| P2 — Atualização dos dados | Adaptadores opcionais, preços separados das quantidades, séries históricas, eventos e metadados de origem e disponibilidade temporal. | P1. | Mudança de cotação não inventa movimentação; ajustes de séries, moedas e períodos são verificáveis; falhas preservam dados anteriores; dados para backtests respeitam o que era conhecido em cada data. |
| P3 — Motor analítico verificável | Valores, alocação, renda, rentabilidade, correlações, volatilidade, drawdown e contribuição ao risco. | P1 e P2. | Casos com respostas conhecidas e tolerâncias documentadas validam cálculos, precisão e unidades; lacunas não viram zero; histórico e versões permitem reproduzir resultados numéricos. |
| P4 — Otimização e robustez | Otimização de aporte e realocação, backtests, testes de estresse, Monte Carlo e sensibilidade, com verificador obrigatório. | P3 e métodos definidos em P0. | Comparação com manter a carteira; restrições respeitadas; custos e execução modelados; falhas de convergência, inviabilidade e sensibilidade expostas; simulações reexecutáveis com a mesma configuração. |
| P5 — IA e pesquisa sob demanda | Integração Anthropic, construção versionada da estratégia, ferramentas analíticas, pesquisa documental e descoberta. | P4 e catálogo autorizado. | Proposta sustentada pelos métodos e evidências pertinentes; entradas e resultados numéricos preservados; conteúdo malicioso não amplia permissões; chamadas e gastos respeitam limites. |
| P6 — CLI | Consultas, análises e operações internas autorizadas, com saída humana e estruturada. | P5 e fluxo de autenticação definido em P0. | Jornada completa pela CLI; mesmas restrições da aplicação; alterações sensíveis exigem confirmação válida. |
| P7 — Interface aprovada | Implementar o design entregue pelo usuário e ligar as capacidades existentes. | P5, dados de P1–P4 e aprovação visual. | Jornada executada no navegador, com responsividade e estados de erro, espera, vazio e dados parciais. |
| P8 — Acompanhamento ativo | Rotinas configuráveis, revisão antes do aporte, histórico e avisos no aplicativo e na CLI. | P5 e primeira jornada validada. | Rotinas idempotentes e limitadas; avisos explicam o que mudou; nenhuma análise continua após atingir o limite configurado. |
| P9 — Jornada integrada e operação | Validar a jornada analítica avançada, uso contínuo, isolamento, segredos e operação self-hosted. | Unidades anteriores entregues. | Risco, otimização, backtests, estresse e Monte Carlo demonstrados na jornada acordada pela web e CLI; smoke, verificações numéricas, navegador e recuperação comprovados; limitações e pendências registradas. |

### P0: pontos concretos a conferir

- Reconciliar a diferença entre a visão de IA ativa e os contratos antigos em
  `AGENTS.md`, `README.md` e `docs/architecture.md` antes de implementar o agente.
  Esta atualização de plano não muda aquelas regras.
- Avaliar a simulação local em `packages/core/src/contribution-allocation.ts`
  e os arquivos associados. A presença de código e testes não comprova sua
  integração nem validação atual.
- Conferir a [PR #44](https://github.com/IcaroAguiar/decision-board/pull/44)
  antes de reaproveitar seu código. Em 2026-10-24, ela estava aberta e o
  `quality-gate` constava como falho. Não há autorização de merge neste plano.
- Definir a autenticação da CLI sem introduzir uma pilha concorrente à atual.
- Definir como configurar e proteger a chave da IA no uso pessoal e na futura
  expansão para usuários independentes.
- Avaliar TypeScript para o núcleo da aplicação e Python para o motor analítico,
  sem manter duas autoridades para carteira, estratégia ou permissões.
- Definir a cobertura inicial por classe e método, os critérios de validação
  numérica e a disponibilidade temporal dos dados. Nenhuma biblioteca pesquisada
  está aprovada ou validada apenas por aparecer no catálogo.
- Definir invalidação de propostas por mudanças materiais, recuperação de
  análises interrompidas e controle de gastos concorrentes. A fila não garante
  uma única chamada ao provedor nem elimina efeitos de tentativas repetidas.

## Design em paralelo

O usuário produzirá o design fora do repositório. O mapa de telas de
[analysis-requirements.md](analysis-requirements.md) orienta a próxima rodada.
P0 e o desenho dos contratos podem avançar enquanto o design é preparado.
P7 depende da entrega e aprovação visual; este plano não autoriza substituir
o design do usuário por uma interface criada durante a implementação.

As referências em `docs/design/references/` pertencem à visão anterior.

## Propostas que ainda precisam de configuração

- Revisão diária, revisão antes do aporte e análise sob demanda constituem um
  desenho inicial de frequência. A periodicidade deve ser configurável.
- Avisos no aplicativo e consultas pela CLI são a base proposta. Um canal
  externo pode ser acrescentado após verificar viabilidade e configuração.
- O limite de gasto da IA é separado do orçamento de investimentos. O valor
  precisa ser configurado antes das rotinas automáticas.
- A IA pode executar consultas, cálculos e simulações dentro dos limites
  autorizados. Os limites exatos para alterar dados, movimentações e planos
  precisam ser definidos por operação.
- Objetivos, horizonte, liquidez, tolerância a perdas e limites de exposição
  fazem parte da construção da estratégia. Não estão fixados nesta conversa.

## Possibilidades futuras e limites atuais

- Execução em corretora permanece em avaliação, sempre com confirmação na
  intenção discutida. Nenhuma API de ordens faz parte da primeira entrega.
- Valuation e outros métodos específicos serão escolhidos conforme as classes
  e as perguntas da estratégia. A cobertura deve ser validada e registrada;
  risco, otimização, backtests, estresse e Monte Carlo integram o escopo central
  definido acima.
- A expansão para outras pessoas preserva isolamento e configurações próprias.
  Comercialização e suporte a outros provedores de IA não estão definidos.
- Não haverá login automatizado em contas financeiras, scraping autenticado,
  dados obrigatoriamente pagos, promessas de retorno ou conclusões tributárias
  sem cobertura validada.
- Taxas de contas remuneradas são parâmetros com condições e vigência
  verificadas. Um percentual do CDI não é uma constante universal do produto.

## Verificação de cada entrega

Use os checks aplicáveis de [testing.md](testing.md). Documentação exige
conferência de fatos e links. Mudanças em dados de usuário exigem testes de
isolamento; schema e autenticação exigem os checks específicos documentados.

Quando a unidade exigir a validação completa, os comandos existentes são:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm coverage
pnpm build
pnpm smoke:api
```

Execute com o runtime e o ambiente documentados, dados sintéticos e fila de
comandos pesados. Preserve as portas efêmeras dos testes. Uma unidade só passa
a concluída depois de implementar, verificar e revisar sua fronteira afetada.

## Estado deste plano

- [x] Consolidar a visão e distinguir decisões de propostas.
- [x] Escrever sequência, dependências e evidências de aceite.
- [x] Preparar briefing para o design do usuário.
- [ ] Concluir P0 e alinhar o contrato arquitetural. O alinhamento dos
  documentos está feito: `docs/architecture.md` e `AGENTS.md` em 2026-11-13 e
  o `README.md` em 2026-11-14. A API atual continua sendo a da visão anterior
  até a P1.
- [ ] Implementar e validar P1–P9.
- [x] Definir o produto como aplicativo independente, com integração futura possível.
- [x] Incluir análises avançadas no critério da primeira versão útil.
- [ ] Fechar stack, métodos e cobertura inicial em P0.
- [ ] Receber e aprovar o novo design.
