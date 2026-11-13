# Prompt para levar ao Claude Design

**Atualização:** 2026-10-25. **Nome escolhido:** Ascend Compass.
**Estado visual:** identidade e telas em exploração, aguardando aprovação.

O texto abaixo é autocontido. Pode ser usado sem acesso ao repositório. O
[briefing detalhado](product-brief.md), o [sistema de design](design-system.md) e
as [opções de nome](naming.md) contêm o contexto completo. O usuário produzirá e
aprovará o design; nenhuma tela deste pacote está aprovada para implementação.

---

## Pedido de design

Desenhe um aplicativo web de acompanhamento e decisão sobre investimentos.
O nome escolhido é **Ascend Compass**. O usuário já possui a marca Ascend,
o aplicativo Ascend e o domínio **https://ascendteam.cloud/**.

O Compass terá identidade visual própria dentro da família Ascend. O vínculo
deve aparecer no nome, em um logo específico com parentesco reconhecível e em
poucos detalhes de assinatura. A paleta, a tipografia e a expressão da interface
serão criadas para o Compass. O objetivo é reconhecer a família e distinguir
os produtos imediatamente.

O produto começa para uso pessoal e poderá receber outras pessoas com suas
próprias carteiras, estratégias e configurações de IA. A IA inicial é a
Anthropic com chave fornecida pela pessoa. A pessoa define um orçamento mensal
de investimentos e um limite separado para o gasto com IA.

O trabalho principal é entender a carteira e a reserva, construir a estratégia
com a IA e avaliar propostas explicáveis. A IA pode pesquisar novos investimentos
que caibam na estratégia, comparar alternativas e propor manutenção, aporte,
realocação, avaliação de venda ou revisão da estratégia. O universo não se
limita a FIIs. A cobertura de cada classe depende dos dados disponíveis.

O Compass é um aplicativo independente do Ascend, com possibilidade de
integração futura. As análises avançadas são centrais na primeira versão útil:
risco e diversificação, otimização sob restrições, backtests, testes de estresse,
Monte Carlo e sensibilidade. O design precisa mostrar como elas sustentam
decisões sobre a carteira e as metas, com métodos e limitações consultáveis.

Crie um ambiente analítico e operacional. O usuário deve localizar dados,
entender limitações e tomar decisões. Não use uma composição de landing page
com slogan, grande hero promocional ou números decorativos.

## Arquitetura de marca e identidade própria

Estude o Ascend existente para identificar o desenho do símbolo, suas proporções,
a relação entre símbolo e nome e os gestos gráficos que podem formar uma família.
Escolha somente dois ou três sinais de parentesco e explique cada escolha.

A família precisa de uma lógica reconhecível, enquanto o Compass recebe uma
identidade autônoma. Não trate o site atual como um template obrigatório de
cores, fontes, cantos, cartões ou navegação. Montserrat, o verde do Ascend e o
azul de uma variante anterior não são requisitos deste produto.

### Logo especial para o Compass

Crie um símbolo próprio para **Ascend Compass**, derivado de características
identificáveis do símbolo Ascend. Explore orientação, direção, leitura de cenário
ou convergência por meio da forma. A relação com a marca precisa ser estrutural;
acrescentar um pequeno ícone de bússola ao logo atual não resolve sozinho.

O símbolo precisa distinguir os produtos lado a lado e funcionar em tamanho
pequeno. Evite depender de detalhe fino ou de uma rosa dos ventos genérica.
Mostre símbolo isolado, assinatura com Ascend Compass, versão monocromática,
versões para fundos claro e escuro e redução para ícone do aplicativo.

Se a página pública não permitir identificar o símbolo original com precisão,
peça o arquivo da marca antes de finalizar a derivação. Enquanto isso, identifique
o estudo como provisório. Não invente características do logo existente.

### Exploração antes das telas

Apresente **duas direções visuais coerentes e realmente diferentes** para o
Compass. Cada uma deve incluir:

- estudo de logo com explicação dos sinais que ligam o Compass ao Ascend;
- paleta própria com funções de cor, incluindo estados e visualização de dados;
- escolha de fontes e hierarquia para leitura, navegação e números financeiros;
- geometria, superfícies, densidade, iconografia e detalhes de assinatura;
- uma pequena amostra equivalente de cabeçalho, dado financeiro e ação, com o
  mesmo conteúdo nas duas opções para facilitar a comparação.

As opções precisam diferir por decisões de identidade e composição, com
justificativa para o produto. Evite apresentar a mesma interface com duas cores.
Depois da escolha do usuário, desenvolva uma única direção e mantenha fidelidade
a ela nas telas restantes.

## Design system do Compass

Construa o sistema a partir da direção escolhida. A identidade do Ascend serve
de referência para o parentesco; o sistema do Compass recebe decisões próprias.

**Tipografia:** escolha fontes pela combinação de personalidade e legibilidade.
Uma família funcional pode atender a dados e controles; uma segunda, se útil,
pode dar expressão aos títulos. Limite o conjunto a duas famílias e explique
seus papéis. Confira numerais tabulares, sinais, moedas, acentos e leitura em
tamanhos pequenos. Defina uma escala completa; corpo entre 14–16 px e metadados
a partir de 12 px são pontos de partida, não a identidade herdada do Ascend.

**Cor:** defina fundos, superfícies, texto principal e secundário, ação,
seleção, foco, links, estados e séries de gráficos. A cor do produto não pode
ser confundida com lucro ou com aprovação da IA. Valores positivos e negativos
também precisam de sinal ou rótulo. Proponha o tema principal mais adequado ao
trabalho e uma versão equivalente para o tema oposto.

**Forma e ritmo:** estabeleça escala de espaçamento, raios, bordas, sombras,
densidade e tamanhos dos controles. Justifique a geometria pela personalidade
do Compass e pela tarefa. Agrupe seções com superfícies discretas e evite caixas
decorativas aninhadas. Sombras ficam concentradas em sobreposições.

**Componentes:** documente navegação, cabeçalho, valor financeiro, origem do dado,
posição da carteira, regra da estratégia, planejador do aporte, proposta,
comparação de cenários, evidência, formulário e andamento de análise. Inclua
variantes, estados e adaptação mobile. O sistema compartilha regras visuais;
cada tela conserva a composição que sua tarefa exige.

Inclua visualizações de correlação e contribuição ao risco, comparação de
trajetórias históricas e referências, resultados de estresse e distribuições
simuladas. Cada visualização deve responder a uma pergunta e ter resumo textual.
Período, hipóteses e limites da cobertura permanecem acessíveis.

**Assinatura do produto:** proponha um elemento reconhecível que ajude a pessoa
a comparar situação atual, alternativas e consequência de uma decisão.
A origem explícita dos dados é um apoio recorrente. Motivos de orientação do
logo podem aparecer pontualmente em navegação ou representação de dados,
sempre com função. Não espalhe bússolas e elementos náuticos pelas telas.

Seleção e prioridade usam superfície, peso e texto. Não use faixa lateral
colorida ou contorno de cor para destacar recomendações. O foco de teclado deve
continuar evidente. Cada contexto tem uma ação preenchida; os demais controles
têm menor ênfase. Tabelas servem para comparar registros equivalentes.
Estratégia, análise, histórico e planejamento precisam de formas próprias.

## Navegação e telas necessárias

A navegação desktop tem **Hoje, Carteira, Estratégia, Aporte, Pesquisa e Decisões**.
**Histórico e avisos** e **Configurações** são secundários. Reserva e movimentações
pertencem à Carteira. Detalhe de ativo abre pela Pesquisa ou Carteira. Evidências
abrem em painel contextual e análises longas têm página própria.

Desenhe estas onze telas e seus subfluxos:

1. **Acesso:** entrada concentrada no espaço pessoal. Ação Entrar. Mostrar
   espera, acesso inválido e sessão expirada, com recuperação do contexto.
2. **Onboarding:** configuração retomável de IA e limite, carteira, reserva,
   estratégia e orçamento. Mostrar etapas preenchidas e lacunas, permitir
   cadastro manual mesmo quando a IA estiver pendente. Mascarar credenciais.
3. **Hoje:** composição guiada pelo balanço e pelas prioridades. Mostrar
   patrimônio e sua finalidade, reserva separada, orçamento do mês e atualidade
   dos dados. Ação Analisar situação. Evitar faixa genérica de cartões de métricas.
4. **Carteira, reserva e movimentações:** distribuição, posições comparáveis e
   extrato. Mostrar instituição, quantidade, custo, preço, origem e data. Reserva
   tem saldo, meta e liquidez. Ação Registrar movimentação. Cadastro e edição
   usam painel ou subfluxo com resumo antes de salvar.
5. **Pesquisa e detalhe do ativo:** busca com filtros e resultados comentados;
   o ativo abre um dossiê de fundamentos, riscos e documentos, com relação à
   estratégia. Ações Pesquisar candidato e, no detalhe, Comparar cenário.
6. **Estratégia:** conversa orientada acompanhada de uma folha editável de
   objetivos, horizonte, liquidez, classes e restrições. Ação Aprovar estratégia.
   Revisões preservam a versão vigente e destacam mudanças e motivos.
   Permitir explorar regras em backtests e estresse e metas em Monte Carlo,
   com hipóteses identificadas e aprovação separada da exploração.
7. **Aporte mensal:** planejamento dentro do orçamento. Mostrar planejado,
   realizado e restante, distribuição atual e otimizada. Ação Simular aporte.
   Comparar alternativas sob restrições, com objetivos, custos e sensibilidade.
   A reserva permanece fora do orçamento disponível.
8. **Mesa de decisões:** fila editorial de propostas com motivo e impacto,
   sem botões dominantes repetidos em todas as linhas. Ação Revisar proposta.
   Incluir a conclusão de manter a carteira como resultado válido.
9. **Detalhe e comparação da proposta:** evidências conduzem à decisão. Mostrar
   cenário atual, manter, próximo aporte e alternativas pertinentes, sob a mesma
   base. Explicar impacto, custos, premissas e incertezas. Ação Aprovar proposta;
   ajustar, adiar e rejeitar são alternativas. Aprovação pede confirmação.
   O aprofundamento analítico usa página própria ligada à proposta, com risco,
   otimização, backtests, estresse e Monte Carlo conforme a pergunta. Mostrar
   método, referência, período e a relação entre os cálculos e a interpretação.
10. **Histórico e avisos:** cronologia de análises, versões, decisões e
    movimentações. Ação Ver contexto. Avisos explicam o que mudou e por quê.
11. **Configurações de IA e dados:** seções separadas para conexão, gasto da IA,
    consumo, fontes opcionais e atualização. Ação Salvar preferências. Explicar
    fonte indisponível, falta de chave e limite atingido.

## Regras de leitura e decisão

Identifique dados **informados, observados e estimados**, com fonte, data, moeda
e unidade. Valor ausente não é zero. Histórico insuficiente aparece como limitação.
Patrimônio, aporte e rentabilidade são indicadores distintos.

Aprovar uma proposta registra uma decisão sobre um cenário. Não significa
executar uma ordem. A movimentação realizada é registrada em outro fluxo.
Não desenhe comandos de ordens reais, sincronização garantida com instituições
ou streaming de mercado como capacidade já disponível.

A IA pode retornar análise parcial, conflito com restrição ou ausência de
evidência. Mostre essas condições junto da decisão. Fontes externas e condições
tributárias sem cobertura validada não podem aparecer como certezas.

Os gráficos informam período e base. Projeções usam rótulo e traço diferentes.
Backtests de estratégia, desempenho pessoal e projeções de metas têm rótulos
distintos. Distribuições simuladas informam suas hipóteses e não representam
retorno garantido. Inviabilidade, falha de convergência, sensibilidade elevada
e ausência de cobertura são estados explícitos do aprofundamento analítico.
Não invente percentuais de confiança, retornos garantidos ou históricos para
preencher espaço. Uma afirmação da análise deve permitir abrir sua evidência.

## Dados demonstrativos

Use somente dados sintéticos, coerentes entre todas as telas:

- Patrimônio atual: **R$ 120.000**.
- Carteira investida: **R$ 90.000**.
- Reserva de emergência: **R$ 30.000**.
- Orçamento mensal planejado: **R$ 2.000**, separado do patrimônio atual.
- Ativos e documentos fictícios, identificados como demonstração.

Não conte a reserva novamente como caixa disponível. Não represente aprovação
de proposta como aporte realizado. Não mostre chaves, e-mails ou dados de uma
pessoa real nos exemplos.

## Estados, responsividade e comportamento

Desenhe primeiro uso, vazio, carregando, dado parcial, fonte vencida, erro
recuperável, estratégia conflitante, proposta inviável, confirmação pendente,
análise concluída e limite da IA atingido. Diferencie nenhuma oportunidade de
falta de dados. Preserve trabalho e contexto quando houver falha.

Use rótulos além de cor. Labels de formulário são persistentes. Gráficos têm
resumo textual. O alvo confortável proposto para toque é 44 px e o foco de
teclado precisa ser visível. Verifique contraste de texto, controles e estados.

Prepare desktop em **1440 px**, mobile em **390 px** e confira a adaptação em
**768 px**. No mobile, use Hoje, Carteira, Decisões e Mais. Detalhes passam a
telas ou folhas próprias; cenários se organizam em blocos com critérios repetidos.
Evite rolagem horizontal da página e ações encobertas pelo teclado.

Transições locais são discretas, entre 120–180 ms; painéis entre 180–240 ms.
Respeite redução de movimento e devolva foco ao acionador. Não use contagem
animada de patrimônio ou cerimônia de entrada em toda navegação.

## Ordem da entrega visual

1. Apresente os dois estudos de identidade do Ascend Compass, com logo,
   paleta, fontes e a pequena amostra comparável. Explique o que liga cada opção
   à família e o que dá personalidade própria ao Compass.
2. Após a escolha da direção, entregue a folha de fundações e componentes,
   com tokens, estados, versões clara e escura e adaptações.
3. Desenvolva **Hoje, Aporte mensal e Detalhe de proposta** para comprovar
   composições distintas. Mostre desktop, mobile e uma amostra do tema oposto.
   Inclua o aprofundamento analítico no detalhe para avaliar a leitura dos
   métodos avançados, das premissas e dos estados de informação insuficiente.
4. Após avaliar essas telas, expanda para as demais sem alterar o sistema
   aprovado.

O resultado deve demonstrar a jornada de configurar, compreender, comparar,
decidir e recuperar-se de uma falha. Se produzir um protótipo, use dados
fictícios e explicite as interações simuladas.

O objetivo é obter identidade e design para avaliação. Não implemente backend,
integrações financeiras nem uma aplicação de produção como parte desta
solicitação.
