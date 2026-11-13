# Simulação de renda fixa (R1/R2)

Motor puro, sem provedores nem relógio. `simulateFixedIncome` e `analyzeRateRisk`
recebem `Datum`, data de análise, versão da estratégia e um `BusinessCalendar`
injetado. Ausências impedem o cálculo correspondente; resultados restantes são
parciais. Cada valor de resgate inclui a evolução bruta e custódia acumulada
ao final de cada DU para alimentar o gráfico do cenário. Nenhuma taxa de custódia ausente é interpretada como zero: para ausência
de cobrança, informe explicitamente taxa zero. Saídas numéricas são estimativas.

## Convenções

- Capitalização em `[início,fim)`, base 252 DU, sem arredondamento. O calendário
  valida os extremos e lança erro em português quando não cobre o período,
  inclusive a data de resgate. Não há ajuste implícito da data de resgate.
- Cada degrau de CDI vale desde `effectiveFrom`, inclusive. O fator diário é
  `(1+r)^(1/252)`; para multiplicador `k`, `1+k*((1+r)^(1/252)-1)`.
  CDI + spread multiplica os fatores diários do CDI e do spread anual efetivo.
- IR incide apenas sobre ganho positivo, pelo prazo corrido original. A tabela
  padrão é nomeada e tem `validFrom`; não se presume que continue vigente no
  futuro. A tabela e a custódia são validadas na data da análise. Isenção é uma
  entrada explícita; regras futuras permanecem não verificadas.
- Custódia simples diária: `max(saldo bruto inicial do DU - faixa isenta,0)
  * taxa anual / 252`. É acumulada e deduzida no resgate, depois do IR sobre o
  ganho bruto. Não reduz a base de IR nem o saldo que capitaliza. Produtos com
  outra convenção exigem adaptação explícita, não interpretação silenciosa.
- R1 estima na curva até o resgate, limitado ao vencimento; liquidez e preço
  antecipado permanecem fora do R1. R2 cobre apenas títulos sem cupom.
- Empate usa bisseção crescente, intervalo padrão `[0,5]` e largura final no
  parâmetro `<=1e-10`. O erro no parâmetro é no máximo metade dessa largura.
  Intervalo sem raiz ou sem crescimento é erro explícito. CDI negativo não é
  aceito pelo solver de multiplicador; capitalização direta aceita taxas > -1.
- O ponto de virada usa um CDI anual constante equivalente, com mesma janela e
  principal, permitindo comparar IR/custódia distintos. Não é média aritmética
  dos degraus de um caminho variável. Acima da raiz o pós-fixado supera o
  prefixado dentro do intervalo crescente modelado.
- R2: `PU=face/(1+y)^(DU/252)`, duração modificada `D=(DU/252)/(1+y)`,
  aproximação relativa `-D*choque`, conferida com reprecificação completa.
  Limite da estratégia em DU restantes a partir da data da análise.

## Precisão verificada

Os testes derivam respostas das fórmulas independentemente do motor. Empates
são verificados com erro absoluto < 0,0001 no multiplicador e tolerância monetária
1e-6 no ponto de virada. PU/reprecificação usam tolerância relativa 1e-12. Para
choque +0,01, o caso sintético de um ano usa erro absoluto na variação relativa
< 0,0001 (1 ponto base do preço). Esse limite verifica a aproximação nesse caso,
não constitui garantia para todo prazo ou taxa: a convexidade cresce com o prazo.
