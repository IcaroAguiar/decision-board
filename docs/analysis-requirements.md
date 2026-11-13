# Requisitos de análise do Ascend Compass

**Data:** 2026-11-10. **Estado:** proposta, aguardando revisão do usuário.
**Origem:** análises que o autor fez manualmente com uma IA, antes de o Compass
existir. Elas passam a ser requisitos do sistema, para que a pessoa tenha
segurança nas operações que decidir com apoio de IA.
**Fontes de dados:** [plano de fontes de dados](plan/2026-11-10-fontes-de-dados.md).

Este documento não contém dados financeiros reais. Os exemplos são sintéticos.

## Regras comuns a todas as análises

- O cálculo roda em código versionado e testado, nunca no modelo de IA. A IA
  escolhe a análise, lê o resultado e o explica.
- Cada resultado mostra o método, as premissas, as fontes com data, a versão
  do método e o que **não** foi verificado.
- Cada valor carrega sua natureza: **informado** pela pessoa, **observado** numa
  fonte ou **estimado** por um método.
- Dado ausente não vira zero. Uma análise com entrada parcial diz que é parcial
  ou não conclui.
- O resultado pode ser reproduzido: entradas, parâmetros e versões ficam
  guardados com a análise.
- O Compass não envia ordens. Uma proposta aprovada vira um plano de operação
  que a pessoa executa fora do produto; a importação seguinte da B3 confere o
  que aconteceu.
- O texto usa "cenário", "proposta", "alerta", "revisão necessária". Nada de
  promessa de retorno nem de conclusão tributária sem cobertura validada.

## Formato de cada ficha

| Campo | Conteúdo |
| --- | --- |
| Pergunta | O que a análise ajuda a decidir |
| Entradas | Dados usados, de onde vêm e sua natureza |
| Método | Como o cálculo é feito |
| Premissas configuráveis | Parâmetros que a pessoa ou a estratégia podem mudar |
| Saída | O que a tela e a IA recebem |
| Declara como não verificado | Limites que aparecem junto do resultado |
| Aceite | Caso sintético com resposta conhecida e tolerância |
| Telas | Onde a análise aparece (ver o mapa no fim) |

---

## R1. Simulação de renda fixa

**Pergunta:** qual título ou aplicação rende mais, líquido, até a data do
objetivo, e em que cenário de juros essa escolha deixa de valer?

**Entradas:**
- títulos e aplicações candidatos com taxa, indexador e vencimento (Tesouro
  pelo espelho; CDB e LCI informados);
- CDI e Selic pelo BCB, observados;
- expectativas do Focus, observadas, e datas do Copom;
- feriados nacionais pelo espelho da ANBIMA.

**Método:**
- capitalização por dias úteis (base 252), com feriados;
- caminho do CDI construído reunião a reunião do Copom, para cada cenário;
- IR regressivo pelo prazo corrido (22,5%, 20%, 17,5%, 15%) e isenção para LCI
  e LCA;
- taxa de custódia da B3 sobre o Tesouro, com a faixa de isenção do Tesouro
  Selic vigente;
- percentual do CDI que faz um CDB ou uma LCI empatar com o candidato;
- CDI médio a partir do qual o prefixado perde para o Tesouro Selic.

**Premissas configuráveis:**
- cenários de Selic: Focus, alternativos e um caminho manual;
- data de resgate;
- tabelas de IR e de custódia, com vigência.

**Saída:**
- valor bruto e líquido por candidato e cenário;
- taxas de empate;
- ponto de virada do prefixado;
- gráfico de evolução.

**Declara como não verificado:**
- a taxa de custódia própria da instituição, quando não informada;
- mudança de regra tributária depois da data da análise;
- o preço de venda antecipada, que fica a cargo do R2.

**Aceite:**
- com CDI constante, o percentual de empate tem forma fechada, e o motor deve
  reproduzi-lo com erro menor que 0,01 p.p.;
- o número de dias úteis entre duas datas confere com o calendário da ANBIMA;
- a alíquota de IR muda exatamente nos dias 181, 361 e 721.

**Telas:** Simulador de renda fixa, Aporte, Meta, Detalhe do ativo.

## R2. Marcação a mercado e duração

**Pergunta:** quanto um título pode perder se precisar ser vendido antes do
vencimento, e qual prazo combina com o objetivo?

**Entradas:**
- títulos da carteira e candidatos;
- preço unitário e taxa do Tesouro Transparente;
- valores MTM e na curva vindos da posição da B3, observados.

**Método:**
- duração modificada a partir do fluxo do título;
- variação estimada de preço para choques de taxa (+1 p.p. por padrão);
- reprecificação completa do fluxo, usada para conferir a aproximação;
- comparação entre o prazo do título e a data do objetivo.

**Premissas configuráveis:**
- tamanho dos choques;
- prazo máximo aceitável definido na estratégia.

**Saída:**
- perda estimada por título e choque;
- duração;
- alerta quando o vencimento passa do prazo do objetivo ou do máximo
  aceitável.

**Declara como não verificado:**
- o preço efetivo de recompra pelo Tesouro na data;
- a liquidez de papéis privados no secundário.

**Aceite:**
- para um prefixado sintético sem cupom, a variação por reprecificação confere
  com a fórmula fechada;
- a aproximação pela duração fica dentro de uma tolerância documentada para
  +1 p.p.

**Telas:** Detalhe do ativo, Carteira (risco de juros), Meta, Simulador de
renda fixa.

## R3. Teste de correlação antes de comprar renda variável

**Pergunta:** este ativo reduz ou aumenta o risco da minha carteira, e com que
estabilidade?

**Entradas:**
- saldos atuais da renda variável (B3, observados);
- séries mensais de retorno total do candidato e de cada posição (provedor
  opcional ou série importada);
- valor do aporte (caixa declarado).

**Método:**
- pesos pelos saldos reais;
- correlação do candidato com a carteira;
- volatilidade anualizada da carteira antes e depois de +R$ X no candidato;
- janelas de 30 e 58 meses;
- correlação móvel de 24 meses, com mínimo e máximo;
- retorno do candidato nos N piores meses da carteira;
- contribuição de cada posição ao risco.

**Premissas configuráveis:**
- janelas;
- N piores meses;
- valor do aporte;
- lista de candidatos.

**Saída:**
- para cada candidato: correlação por janela, faixa da correlação móvel,
  volatilidade antes e depois e comportamento nos piores meses;
- classificação "reduz risco", "aumenta risco" ou "inconclusivo".

**Declara como não verificado:**
- correlação passada não garante a futura;
- a faixa da correlação móvel aparece sempre, para evitar frases como "anda ao
  contrário" quando a correlação oscilou;
- histórico menor que a janela torna o resultado parcial;
- séries de provedor não oficial são sinalizadas como tais.

**Aceite:**
- duas séries sintéticas geradas com correlação conhecida são recuperadas
  dentro da tolerância;
- a volatilidade de carteira com pesos conhecidos confere com o cálculo
  matricial;
- um candidato com série menor que a janela produz resultado parcial, não um
  número.

**Telas:** Aporte (checagem antes da compra), Detalhe do ativo (aba Risco),
Estratégia e risco, Decisões.

## R4. Triagem de renda

**Pergunta:** quais FIIs e ações pagadoras de renda passam nos critérios
mínimos da estratégia?

**Entradas:**
- DY de 12 meses (proventos e preço);
- retorno total em 3 anos;
- correlação com a carteira (R3);
- P/VP, patrimônio líquido e liquidez diária (CVM para FII; provedor opcional
  ou dado informado para o resto).

**Método:**
- filtros e ordenação pelos critérios da estratégia;
- cada métrica com fonte e data;
- candidatos sem dado suficiente vão para uma lista à parte.

**Premissas configuráveis:**
- limites de P/VP, DY, liquidez e patrimônio;
- universo de ativos;
- peso de cada critério.

**Saída:**
- tabela comentada de candidatos que passaram, com o motivo;
- lista dos excluídos e por quê;
- lista dos sem dados.

**Declara como não verificado:**
- vacância, inadimplência e qualidade da carteira de recebíveis, quando não
  houver fonte;
- DY passado não é renda futura;
- retornos anômalos (por exemplo, mais de 100% em 3 anos) são sinalizados para
  conferência, não aceitos.

**Aceite:**
- um universo sintético com valores conhecidos produz exatamente as listas
  esperadas;
- uma série com salto artificial dispara o alerta de retorno anômalo.

**Telas:** Pesquisa e triagem, Detalhe do ativo, Aporte.

## R5. Custo, valor atual e proventos por ativo

**Pergunta:** este ativo está realmente dando prejuízo, e por quê?

**Entradas:**
- negociações e movimentações da B3 (custo e quantidade);
- proventos recebidos (B3);
- preço atual;
- séries de juros e índices, para explicar o contexto.

**Método:**
- custo médio por ativo;
- resultado não realizado;
- proventos acumulados desde a primeira compra;
- resultado total (não realizado mais proventos);
- comparação do movimento do ativo com o de juros e índices no mesmo período,
  como contexto, sem afirmar causa.

**Premissas configuráveis:**
- período de comparação;
- inclusão ou não dos custos de corretagem no custo.

**Saída:**
- por ativo: custo, valor, resultado, proventos e resultado total;
- nota de contexto com os indicadores que se moveram no período.

**Declara como não verificado:**
- custo anterior a 01/11/2019 ou fora da B3, quando informado;
- eventos corporativos não reconhecidos pelo importador;
- a relação de causa entre juros e preço, que é uma hipótese.

**Aceite:**
- um histórico sintético com compras, desdobro e bonificação gera o custo médio
  esperado;
- os proventos somados conferem com as linhas de movimentação.

**Telas:** Carteira, Detalhe do ativo, Mercado.

## R6. Renda mensal estimada

**Pergunta:** quanto a carteira gera por mês, em dinheiro e em acúmulo, bruto
e líquido?

**Entradas:**
- proventos por cota e quantidade na data-com (B3 para o recebido; estimativa
  para o a receber);
- taxa e saldo da reserva (informados);
- títulos do Tesouro e seu rendimento estimado (R1).

**Método:**
- renda separada em "cai em dinheiro" (proventos, juros de cupom) e "só
  acumula" (reserva, Tesouro sem cupom);
- valores bruto e líquido, conforme a tributação de cada tipo.

**Premissas configuráveis:**
- base de estimativa dos proventos futuros (média de 3, 6 ou 12 meses);
- taxa da reserva e sua vigência.

**Saída:**
- renda por mês e por fonte, bruta e líquida;
- calendário de proventos recebidos e estimados.

**Declara como não verificado:**
- proventos futuros são estimativas;
- a quantidade na data-com, quando a movimentação não cobre a data;
- a condição da taxa da reserva (teto de saldo, vigência).

**Aceite:**
- quantidades e proventos sintéticos com data-com conhecida geram a renda
  esperada;
- uma compra depois da data-com não entra no provento daquele mês.

**Telas:** Renda, Hoje, Meta, Carteira.

## R7. Concentração e alocação contra o alvo

**Pergunta:** a carteira está onde a estratégia diz que deveria estar?

**Entradas:**
- posições por classe, subclasse, setor e instituição;
- alvos e faixas da estratégia.

**Método:**
- pesos atuais;
- desvio em relação ao alvo;
- concentração por classe, ativo e emissor;
- proposta de rebalanceamento só com aportes, sem venda, respeitando lotes e
  custos (R10).

**Premissas configuráveis:**
- alvos e faixas;
- se vender é permitido;
- valor mínimo por operação.

**Saída:**
- barras de atual contra alvo;
- alertas de concentração;
- sugestão de destino do aporte para reduzir o desvio.

**Declara como não verificado:**
- posições fora da B3 desatualizadas;
- ativos sem classificação de setor.

**Aceite:**
- uma carteira sintética acima do limite de uma classe gera o alerta;
- o rebalanceamento só com aportes nunca propõe venda quando vender não é
  permitido.

**Telas:** Estratégia e risco, Hoje, Aporte, Carteira.

## R8. Projeção contra o realizado da Meta

**Pergunta:** a Meta está no caminho certo?

**Entradas:**
- valor alvo e data da Meta (informados);
- aportes planejados e realizados (caixa declarado e B3);
- rendimento projetado (R1);
- valor atual (B3 ou informado).

**Método:**
- projeção mês a mês feita no início do plano e congelada;
- comparação com o realizado;
- alerta quando o ganho real fica abaixo do projetado em mais que o limite
  configurado (15% por padrão);
- separação entre o desvio causado por aporte e o desvio causado por
  rendimento.

**Premissas configuráveis:**
- limite do alerta;
- cenário de juros da projeção;
- reprojeção quando a pessoa muda a Meta.

**Saída:**
- gráfico de projetado contra realizado;
- tabela mensal;
- alerta com a causa provável (dinheiro parado, aporte menor ou rendimento
  menor).

**Declara como não verificado:**
- meses sem importação ou sem caixa declarado;
- a projeção é um cenário condicionado às premissas.

**Aceite:**
- um realizado sintético 20% abaixo no rendimento gera o alerta com a causa
  "rendimento";
- um aporte faltante gera a causa "aporte".

**Telas:** Meta, Hoje, Revisão mensal.

## R9. Reconciliação e qualidade de dados

**Pergunta:** posso confiar nos números que estou vendo?

**Entradas:**
- todas as importações;
- cadastros manuais;
- dados do espelho, com suas datas.

**Método:**
- detecção de posições duplicadas (mesmo ativo, instituição e conta);
- comparação da posição importada com a posição derivada das movimentações;
- idade de cada preço e saldo;
- ativos sem fonte;
- moeda e unidade de cada valor;
- totais calculados só com o que está completo, ou marcados como parciais.

**Premissas configuráveis:**
- idade máxima aceitável por tipo de dado.

**Saída:**
- painel de pendências com gravidade e ação sugerida (reimportar, informar,
  ignorar com motivo);
- selo de qualidade em cada número exibido.

**Declara como não verificado:**
- saldos informados sem data recente;
- ativos que a B3 não cobre.

**Aceite:**
- uma importação sintética com linha duplicada gera a pendência sem somar duas
  vezes;
- preço com data além do limite aparece como desatualizado;
- um total com parte ausente nunca aparece como total completo.

**Telas:** Qualidade dos dados, Revisão mensal, selos em todas as telas.

## R10. Viabilidade operacional

**Pergunta:** a proposta pode ser executada como está?

**Entradas:**
- cadastro de instrumentos (existência do ticker, lote, fracionário);
- preço;
- custo de ordem informado ou observado;
- taxas do Tesouro Direto e do secundário (informadas);
- regra de uma conta de Tesouro Direto por agente de custódia;
- instituições da pessoa.

**Método:** cada item da proposta passa por uma lista de verificação.
- O instrumento existe e é negociável?
- Quantidade inteira em lote, ou fracionário disponível?
- Valor mínimo atendido?
- Pregão aberto no horário pretendido?
- Custo da ordem em percentual do valor?
- Taxa do Tesouro Direto melhor que a do secundário?
- Conta de Tesouro Direto no agente certo?
- Liquidez do título suficiente para o prazo?

**Premissas configuráveis:**
- custo de ordem por instituição;
- percentual máximo de custo aceitável;
- instituições permitidas.

**Saída:**
- lista de verificação com passou, falhou ou não verificado;
- proposta ajustada (por exemplo, 1 cota em vez de 2) com a sobra realocada.

**Declara como não verificado:** qualquer item sem fonte, como lote e
fracionário enquanto o cadastro de instrumentos não estiver confirmado.

**Aceite:**
- um ticker inexistente é recusado;
- uma quantidade fracionária de ETF é ajustada para lote inteiro;
- um custo acima do limite gera alerta.

**Telas:** Decisões (detalhe da proposta), Aporte, Detalhe do ativo.

## R11. Salvaguardas de IA

**Pergunta:** como saber que a proposta da IA é segura de seguir?

**Regras:**
- **Movimentação:** nenhuma movimentação é registrada como feita sem
  confirmação explícita da pessoa naquela sessão. Rotinas agendadas só
  verificam, calculam e alertam.
- **Plano de operação:** toda proposta de compra ou venda vira um plano de
  operação revisado e confirmado. O Compass não executa.
- **Cálculo:** toda proposta traz o cálculo reproduzível (R1 a R10 aplicáveis),
  as fontes e as datas.
- **Lacunas:** toda proposta lista o que não foi testado. Uma proposta de renda
  variável sem o R3 fica bloqueada até rodar o teste ou receber justificativa
  registrada.
- **Afirmações:** frases da IA sobre números precisam apontar para um resultado
  calculado. Afirmação sem resultado aparece como opinião não verificada.
- **Registro:** o registro de decisões guarda data, decisão, motivo, análises
  usadas e versão dos métodos.

**Aceite:**
- uma proposta de renda variável sem R3 não pode ser aprovada;
- uma rotina agendada não consegue gravar movimentação;
- cada decisão registrada tem motivo e análises associadas.

**Telas:** Decisões, Configurações de IA, Histórico.

## R12. Preferências que viram configuração

**Pergunta:** quais escolhas pessoais mudam o resultado das análises?

**Configurações:**
- estrutura da carteira: Reserva, Meta e Renda variável, com função, alvo e
  prazo de cada parte;
- prazo máximo aceitável para renda fixa;
- preferência por renda mensal reinvestível;
- instituições permitidas por tipo de ativo;
- teto e taxa da reserva, com vigência;
- caixa mensal: aporte, data do recebimento, folga e divisão entre Meta e
  Renda variável, com lembrete.

**Aceite:** mudar uma preferência gera nova versão da estratégia e marca as
análises anteriores como feitas sob a versão antiga.

**Telas:** Cadastro guiado, Estratégia e risco, Aporte, Configurações.

---

## Mapa de telas para a rodada de design

O feedback de design pede uma aplicação séria e moderna, à altura dos SaaS de
investimento. As telas abaixo ampliam o briefing de 25/10, que tinha onze
telas; as novas são Revisão mensal, Mercado, Simulador de renda fixa, Renda,
Meta e Qualidade dos dados.

| Tela | Função | Requisitos |
| --- | --- | --- |
| Acesso e cadastro guiado | Login, estrutura da carteira, importação B3, ativos fora da B3, caixa, IA | R9, R12 |
| Hoje | Patrimônio, renda do mês, Meta, alertas e próxima ação | R6, R7, R8, R9 |
| Revisão mensal | Ritual guiado: baixar e importar os arquivos da B3, declarar o caixa, resolver pendências, ver o resumo do mês | R8, R9, R12 |
| Carteira | Posições por parte (Reserva, Meta, Renda variável), alocação, custo, valor e proventos | R2, R5, R6, R7 |
| Detalhe do ativo | Preço, custo contra valor contra proventos, risco e correlação, fundamentos, viabilidade | R1, R2, R3, R4, R5, R10 |
| Mercado | Selic, Focus, curva do Tesouro, índices e contexto dos movimentos | R1, R5 |
| Simulador de renda fixa | Cenários de juros, comparação de títulos, empate com CDB e LCI | R1, R2 |
| Pesquisa e triagem | Filtros de renda e de estratégia, candidatos comentados | R3, R4 |
| Estratégia e risco | Regras, alvos, concentração, contribuição ao risco | R3, R7, R12 |
| Aporte | Caixa declarado, distribuição entre Meta e Renda variável, checagens antes da compra | R1, R3, R4, R7, R10, R12 |
| Meta | Projeção contra realizado, alertas, prazo | R1, R2, R6, R8 |
| Renda | Calendário de proventos recebidos e estimados, em dinheiro e em acúmulo | R6 |
| Decisões | Propostas, plano de operação, verificação de viabilidade, registro | R3, R10, R11 |
| Qualidade dos dados | Pendências, idade das fontes, reconciliação | R9 |
| Histórico | Análises, versões, decisões e importações | R11 |
| Configurações | IA e limite de gasto, preferências, provedores opcionais, backup | R11, R12 |

No celular, a navegação inferior proposta é Hoje, Carteira, Aporte, Decisões e
Mais.
