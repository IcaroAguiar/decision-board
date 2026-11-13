# Briefing das telas para o design

**Atualização:** 2026-10-25. **Responsável pelo design:** usuário, no Claude Design.
**Estado:** direção proposta, aguardando o design do usuário e aprovação visual.

A marca **Ascend** e o domínio **ascendteam.cloud** já existem, conforme informado
pelo usuário. O nome escolhido para o novo produto é **Ascend Compass**.
O Compass terá identidade própria, com logo específico e poucos sinais de
parentesco. Cores, fontes e expressão da interface são escolhas autônomas.
A mudança de nome no briefing não renomeia repositório, pacotes ou serviços.

O [plano do produto](../product-plan.md) orienta o escopo. A identidade visual será
orientada pelo [sistema de design](design-system.md), a decisão de nome por
[naming.md](naming.md) e a geração pelo
[prompt para o Claude Design](claude-design-prompt.md).

## Propósito e limites

A pessoa acompanha carteira e reserva, define o orçamento mensal, constrói sua
estratégia com IA e avalia propostas explicáveis. A pesquisa inclui investimentos
fora da carteira, conforme as classes elegíveis da estratégia. O uso inicial é
pessoal, com chave própria da Anthropic, aplicação web e CLI com capacidades e
limites equivalentes. A expansão futura preserva contas e configurações próprias.

O Compass funciona como aplicativo independente do Ascend, com possibilidade
de integração futura. As análises avançadas integram a primeira versão útil:
risco e diversificação, otimização sob restrições, backtests, testes de estresse,
Monte Carlo e sensibilidade. O design deve permitir compreender como esses
resultados sustentam uma proposta e quais limitações afetam a conclusão.

O MVP oferece análises sob demanda. Aprovar uma proposta registra uma decisão.
Uma movimentação só reflete uma operação realizada quando a pessoa a registra
separadamente. Não desenhe comandos para executar ordens reais, promessas de
retorno, sincronização garantida com XP ou Mercado Pago, nem atualização contínua
em tempo real.

## Arquitetura de informação proposta

A navegação principal contém **Hoje, Carteira, Estratégia, Aporte, Pesquisa e
Decisões**. **Histórico e avisos** e **Configurações** ficam no nível secundário.
Acesso e onboarding antecedem o ambiente principal.

Reserva e movimentações pertencem à Carteira. Cadastro, edição e consulta de
origem usam painéis laterais ou subfluxos. O detalhe de ativo pertence à Pesquisa
e também abre pela Carteira. Proposta e comparação usam uma página de leitura
dentro de Decisões. Evidências abrem em painel contextual sem perder a análise.

As onze telas e seus subfluxos abaixo compõem o MVP proposto. As análises
aprofundadas usam uma página própria no contexto da proposta, sem exigir uma
nova área principal de navegação.

## Telas e subfluxos do MVP

### 1. Acesso

**Tarefa e dados:** entrar no espaço pessoal, com identificação e estado da sessão.

**Composição e ação:** formulário concentrado e identificação provisória da marca.
Ação principal: **Entrar**. Recuperação de acesso depende do método disponível.

**Estados e dependências:** acesso inválido, espera, indisponibilidade e sessão
expirada com retorno ao contexto anterior. Depende do método de acesso definido.
Dados da carteira ficam disponíveis após autenticação.

### 2. Onboarding

**Tarefa e dados:** configurar IA e limite, cadastrar instituições, posições,
reserva e pendências antes da primeira análise.

**Composição e ação:** etapas com resumo do preenchimento, seguidas de estratégia
e orçamento. **Continuar configuração** conduz ao próximo passo. Permitir retomada
e identificar etapas obrigatórias e opcionais.

**Estados e dependências:** carteira vazia, cadastro parcial, IA indisponível e
limite ausente. Depende do acesso. Sem IA configurada, o cadastro manual continua
disponível e a análise explica sua pendência. Credenciais aparecem mascaradas.

### 3. Hoje

**Tarefa e dados:** entender a situação e escolher o que revisar. Mostrar
patrimônio, carteira, reserva, caixa, orçamento restante e atualidade dos dados.

**Composição e ação:** resumo patrimonial com parcelas identificadas, faixa da
reserva e lista editorial de prioridades com motivos. **Analisar situação**
inicia a revisão. O aporte do mês fica próximo do orçamento.

**Estados e dependências:** primeiro uso, análise em andamento, dados parciais,
falha de fonte, limite da IA e nenhuma revisão necessária. Cada indicador depende
dos cadastros e da qualidade dos dados.

### 4. Carteira, reserva e movimentações

**Tarefa e dados:** conferir instituições, quantidades, custo, preço, valor e
finalidade. A reserva informa saldo, meta, liquidez e base da estimativa.

**Composição e ação:** distribuição por classe, tabela de posições agrupável,
faixa da reserva e aba de extrato. **Registrar movimentação** abre formulário
contextual com resumo antes de salvar.

**Estados e dependências:** sem posições, custo desconhecido, histórico incompleto,
divergência e preço vencido. Depende de quantidades e origens registradas.
Atualizar cotação é ação separada e não cria movimentação.
O aprofundamento de risco mostra correlações e contribuição ao risco quando
o método for aplicável, com período, base de cálculo e cobertura identificados.

### 5. Pesquisa e detalhe de ativo

**Tarefa e dados:** investigar candidatos e posições existentes, com classe,
liquidez, riscos, fundamentos, documentos, período e relação com a estratégia.

**Composição e ação:** busca com filtros e resultados comentados. O detalhe abre
um dossiê, com gráficos quando houver histórico adequado. **Pesquisar candidato**
inicia a investigação. No dossiê, **Comparar cenário** encaminha para Decisões.

**Estados e dependências:** sem resultado, nenhum candidato adequado, pesquisa
parcial e classe sem cobertura suficiente. Depende da estratégia e de fontes
identificadas. Contemplar renda fixa, ações, ETFs, FIIs e outras classes elegíveis.

### 6. Estratégia

**Tarefa e dados:** construir objetivos, horizonte, liquidez, tolerância a perdas,
classes elegíveis e limites de exposição.

**Composição e ação:** conversa orientada com IA ao lado de uma síntese editável
das regras. **Aprovar estratégia** confirma a versão apresentada. Revisões mostram
alterações e motivos em relação à versão vigente.
Permitir explorar o efeito das regras em backtests e testes de estresse e
avaliar metas por cenários de Monte Carlo, mantendo as premissas visíveis.

**Estados e dependências:** rascunho, restrições conflitantes, lacunas, revisão
pendente e versão aprovada. Depende das respostas da pessoa e da IA disponível
para a conversa. A versão vigente permanece identificada durante uma revisão.

### 7. Aporte mensal

**Tarefa e dados:** definir o orçamento e avaliar sua distribuição, distinguindo
valores planejados, realizados e restantes.

**Composição e ação:** valor editável, sequência curta de planejamento e barras de
distribuição atual e simulada. **Simular aporte** compara possibilidades com o
orçamento disponível. A comparação usa otimização sob as restrições da
estratégia e permite inspecionar objetivos, custos e sensibilidade do resultado.
A reserva permanece identificada fora desse valor.

**Estados e dependências:** orçamento zerado, mês sem aporte, dados insuficientes,
proposta acima do limite e restrições incompatíveis. Depende da carteira, da
estratégia vigente e dos preços utilizados. Aprovar o plano não registra aporte
realizado.

### 8. Mesa de decisões

**Tarefa e dados:** localizar propostas, com motivo, data, impacto resumido,
validade dos dados e estado da decisão.

**Composição e ação:** fila de leitura com resumo de cada proposta e filtros por
estado. **Revisar proposta** abre o detalhe.

**Estados e dependências:** nenhuma proposta, análise em andamento, manter a
carteira, revisão necessária e proposta adiada. Depende de análises concluídas
com limitações identificadas. Aceitas, ajustadas e rejeitadas seguem acessíveis
no histórico.

### 9. Detalhe e comparação de proposta

**Tarefa e dados:** avaliar justificativa, cenário atual, alternativas, impacto,
premissas, riscos, custos, tributos e incertezas. Comparar também com manter a
carteira, usando a mesma data e base de valores.

**Composição e ação:** argumento inicial, comparação alinhada e evidências junto
das afirmações. **Aprovar proposta** pede confirmação do cenário. Ajustar, adiar
e rejeitar são alternativas explícitas.

O aprofundamento analítico apresenta risco, otimização, backtests, estresse e
distribuições de Monte Carlo conforme a pergunta. Permitir consultar método,
período, referência de comparação, hipóteses, custos e versões dos resultados.
Mostrar a relação entre o resultado numérico e a justificativa da IA. Uma
projeção de metas não se confunde com o desempenho histórico da carteira.

**Estados e dependências:** evidência insuficiente, cenário inviável, dados vencidos
e confirmação pendente. Depende de estratégia, orçamento e verificação das
restrições. Custos e tributos sem cobertura aparecem como pendências.
Contemplar cálculo inviável, falha de convergência, sensibilidade elevada,
histórico insuficiente e método sem cobertura para a classe. Dados ausentes
não podem ser substituídos por gráficos ou resultados demonstrativos.
Mudanças relevantes exigem revisão. A aprovação mantém visível
**Operação ainda não registrada**. O registro posterior é outro subfluxo.

### 10. Histórico e avisos

**Tarefa e dados:** recuperar análises, versões, decisões e movimentações, com data,
origem e relação entre os registros.

**Composição e ação:** linha do tempo filtrável, com avisos que explicam mudanças
e motivos de revisão. **Ver contexto** reabre o registro relacionado.

**Estados e dependências:** histórico vazio, aviso lido, pendência resolvida e
análise antiga preservada. Depende dos registros anteriores. No MVP, avisos ficam
no aplicativo e são consultáveis pela CLI.

### 11. Configurações de IA e dados

**Tarefa e dados:** controlar conexão Anthropic, limite de gasto por período,
consumo, fontes opcionais e preferências de atualização.

**Composição e ação:** seções IA e Dados com explicações junto aos controles.
**Salvar preferências** confirma mudanças. Mostrar conexão e credencial mascarada,
sem reproduzir segredos em exemplos ou mensagens.

**Estados e dependências:** sem chave, falha de conexão, limite atingido e fonte
sem cobertura. Depende das escolhas da pessoa e dos serviços disponíveis.
O limite da IA fica separado do orçamento mensal.
Ao atingir o limite, as chamadas de IA param. Fontes opcionais preservam o
cadastro manual. Substituir valores informados exige escolha explícita.

## Primeira sessão e ciclo recorrente

A primeira sessão segue este percurso:

1. Entrar, configurar a IA e estabelecer o limite de gasto.
2. Cadastrar carteira, reserva e dados iniciais, identificando lacunas.
3. Construir e aprovar a estratégia, depois definir o orçamento mensal.
4. Solicitar análise, comparar alternativas com os métodos avançados pertinentes,
   conferir evidências e limitações e registrar uma decisão.

Ao terminar, a pessoa reconhece o que está confirmado, estimado ou pendente.
No ciclo recorrente, consulta Hoje, confere dados e movimentações, revisa o aporte,
solicita análise e acompanha a decisão no histórico. Web e CLI preservam os
mesmos significados para análise, aprovação e registro de movimentação.

## Clareza dos dados e adaptação mobile

Identifique dados **informados, observados e estimados**, com origem, data,
moeda e unidade. Variação patrimonial, aportes realizados e rentabilidade têm
rótulos próprios.
Histórico insuficiente produz indicador parcial ou indisponível. Evite apresentar
ausência de informação como zero. Cada valor tem uma finalidade, sem contar a
reserva novamente como caixa para investir. Taxas estimadas informam condições
e vigência.

Use somente exemplos sintéticos: patrimônio de R$ 120.000, com R$ 90.000 na
carteira e R$ 30.000 na reserva. O orçamento mensal de R$ 2.000 é um planejamento
separado. Identifique ativos e documentos fictícios como exemplos.

No desktop, varie a composição entre resumo, extrato, conversa, planejamento e
dossiê. No mobile, proponha Hoje, Carteira, Decisões e Mais na navegação inferior.
Converta painéis laterais em telas completas e compare cenários em blocos
sucessivos com critérios repetidos. Preserve fonte, data e ação principal sem
rolagem horizontal obrigatória. Use rótulos além de cor, foco visível, leitura
legível e controles adequados ao toque.

## Evoluções e referências

Rotinas ativas configuráveis entram após validar a jornada sob demanda, com
limites de gasto e permissões definidos. Canais externos, importações e fontes
financeiras adicionais dependem de viabilidade. As análises avançadas descritas
acima pertencem ao escopo inicial e exigem dados e métodos validados. As fases
de construção não autorizam apresentar uma jornada analítica incompleta como
produto pronto. Nenhuma dessas capacidades é promessa de execução financeira.

O [índice de referências anteriores](README.md) pertence à visão anterior e não
substitui o design do usuário. A
[pesquisa de ferramentas](../research/ferramentas-analise-investimentos-2026-10-24.md)
contextualiza capacidades propostas. Os contratos antigos do produto precisam
ser conciliados com o novo plano antes da implementação da IA.
