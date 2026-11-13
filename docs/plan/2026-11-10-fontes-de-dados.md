# Fontes de dados do Decision Board

**Data:** 2026-11-10. **Estado:** proposta. A leitura dos arquivos da B3 ainda
precisa ser confirmada com arquivos reais (fase F1).
**Abrange:** Decision Board.
**Requisitos de análise:** [analysis-requirements.md](../analysis-requirements.md).

## Decisões de partida

1. **O Decision Board é hospedado**, como um SaaS: login, uso em qualquer aparelho,
   dados no servidor do produto. A restrição de não guardar dados no servidor
   vinha da Pluggy, cujo uso em servidor exigiria o plano de produção. Com a B3
   por arquivo e o caixa declarado, o Decision Board não depende da Pluggy, e essa
   restrição deixa de valer para ele (decisão do usuário em 10/11/2026).
2. **O Decision Board não usa a Pluggy.** As posições vêm da B3, e o caixa é
   declarado pela pessoa. Uma integração futura com o Finance seria
   produto a produto, sem a Pluggy no Decision Board.
3. **O Decision Board trata só de investimentos.** Gastos, contas e cartões pertencem
   ao Ascend Finance.
4. **O caixa para aporte é declarado pela pessoa no Decision Board.** A B3 não informa
   esse valor, e o Decision Board não depende do Finance nem da Pluggy para obtê-lo.
   A integração com o Finance é uma opção futura.
5. **O Decision Board nunca envia ordens.** Ele monta um plano de operação; a pessoa
   executa na corretora, e a importação seguinte da B3 confere o que foi feito.
   Isso mantém a regra do `AGENTS.md` contra APIs de ordens.

## Fontes do Decision Board

| Dado | Fonte principal | Alternativa | Natureza |
| --- | --- | --- | --- |
| Posição por ativo e instituição | Arquivo de posição da Área do Investidor da B3 | Cadastro manual | Observado, com data de referência |
| Negociações e custo de aquisição | Arquivos de negociação e movimentação da B3 (desde 01/11/2019) | Cadastro manual para compras anteriores ou fora da B3 | Observado; custo anterior a 2019 é informado |
| Proventos recebidos | Movimentação da B3 (dividendo, JCP, rendimento) | Cadastro manual | Observado |
| Proventos a receber | Sem fonte oficial gratuita confirmada | Estimativa pelo histórico | Estimado |
| Cofrinhos, caixinhas e contas remuneradas | Cadastro manual com taxa, condição e vigência | Finance, no futuro | Informado |
| Fundos abertos, previdência e cripto | Cadastro manual | — | Informado |
| Caixa para aporte | Declaração mensal no Decision Board | Finance, no futuro | Informado, com data |
| Preços, taxas, índices e séries | Fontes públicas, coletadas pelo servidor | Provedor opcional configurado no ambiente | Observado, com fonte e data |

A B3 consolida as posições de todas as corretoras e custodiantes num só
arquivo, o que a torna a fonte certa para o patrimônio investido. Não é uma
fonte contínua, porque o arquivo só muda quando a pessoa baixa outro. O
produto deve tratar a importação como um ritual mensal guiado, não como uma
sincronização.

## B3 por arquivo

### O que a B3 oferece ao investidor

A Área do Investidor tem os extratos de **Posição**, **Movimentação** e
**Negociação**, que se baixam em PDF ou Excel por categoria e período, e os
relatórios consolidados mensal e anual. A Movimentação tem o filtro
"Proventos recebidos". Fonte: [material oficial da B3 sobre a área logada](https://b3.com.br/data/files/15/64/1A/AD/CDD8F710C3D7B7F7AC094EA8/Material_IR22_Area_logada_v4.pdf).

Cobertura declarada pela B3:

- renda variável (ações, units, BDRs, FIIs, ETFs e FIPs), derivativos, ouro
  e empréstimo de ativos;
- todos os títulos do Tesouro Direto;
- captação bancária (CDB, RDB, LCI, LCA, LF e LC), CRI, CRA, debêntures e
  outros papéis de renda fixa. A renda fixa chegou à área do investidor em
  outubro de 2025, e alguns papéis só aparecem se o emissor tiver a
  certificação exigida.

Ficam de fora cofrinhos, caixinhas e aplicações automáticas, segundo
[a notícia da B3 sobre a inclusão da renda fixa](https://www.b3.com.br/pt_br/noticias/plataforma-da-b3-que-consolida-investimentos-de-diferentes-corretoras-passa-a-incluir-ativos-de-renda-fixa.htm).
O [webinar das APIs](https://www.b3.com.br/data/files/99/00/1E/5D/6C39F71026F0F8F7AC094EA8/Material%20Webinar.pdf)
indica dados em D-1 e histórico desde 01/11/2019. O material é de 2021, e o
prazo pode ter mudado.

### Layout dos arquivos (medido por terceiros, não documentado pela B3)

A B3 não publica as colunas. Os parsers públicos abaixo foram escritos a
partir de arquivos reais e concordam entre si:

- **Movimentação:** `Entrada/Saída, Data, Movimentação, Produto, Instituição,
  Quantidade, Preço unitário, Valor da Operação`. Tipos de movimentação incluem
  liquidação de compra e venda, dividendo, JCP, rendimento, desdobro,
  bonificação, fração, leilão de fração, resgate, atualização, aplicação e
  pagamento de juros.
- **Negociação:** `Data do Negócio, Tipo de Movimentação, Mercado,
  Prazo/Vencimento, Instituição, Código de Negociação, Quantidade, Preço, Valor`.
- **Posição:** uma aba por classe (Ações, BDR, ETF, Fundo de Investimento,
  Renda Fixa, Tesouro Direto, COE). A renda variável traz `Conta`,
  `Preço de Fechamento` e `Valor Atualizado`. A renda fixa traz preço e valor
  em três bases: **MTM, curva e fechamento**. O Tesouro traz `Valor Aplicado`,
  `Valor bruto`, `Valor líquido` e `Valor Atualizado`.
- A posição **não traz preço médio nem data de compra**. O custo sai do
  histórico de negociações.

Particularidades citadas pelos parsers: datas em texto `DD/MM/AAAA`, `-` como
valor vazio, linha final de total no relatório consolidado e dimensão da
planilha declarada de forma errada. A B3 muda colunas sem aviso, então o
importador lê por nome de coluna, valida o cabeçalho e recusa o arquivo de
forma explícita quando não reconhece o layout. Nunca importa parcialmente
sem avisar.

Referências: [COIR](https://github.com/MarceloPCF/COIR),
[ia-invest](https://github.com/bducraux/ia-invest),
[wealth](https://github.com/heltondev/wealth),
[gumbinvest](https://github.com/gustavobonassa/gumbinvest/blob/main/docs/importing.md).

### O que a fase F1 precisa confirmar com arquivos reais

O teste usa arquivos do autor, lidos localmente, sem copiar valores para o
repositório. Os fixtures do projeto serão sintéticos, com o mesmo layout.

- Colunas de cada arquivo e de cada aba, comparadas com o layout acima.
- Quais colunas trazem identificadores pessoais (conta, CPF, nome), para que o
  importador as descarte.
- Se o `Valor Atualizado` do Tesouro é a mercado ou na curva.
- Se o preço de fechamento é do dia útil anterior à data de referência.
- Se CDB e LCI de bancos digitais aparecem e com quais bases de valor.
- Se fundos abertos aparecem (a aba "Fundo de Investimento" parece conter
  só FIIs).
- Período máximo por download e se a posição pode ser pedida em datas passadas.
- Se a movimentação permite conciliar posições duplicadas entre instituições.

### API da Área do Investidor

Fica fora do plano atual. A B3 a oferece a empresas que contratam a licença,
passam por avaliação de segurança e assinam contrato, com tarifa por CPF desde
02/01/2025. O consentimento é dado pela pessoa na área logada da B3, e as
chamadas usam OAuth com autenticação mútua por certificado da empresa. Não há
modalidade para pessoa física. Fontes:
[página das APIs](https://www.b3.com.br/pt_br/produtos-e-servicos/central-depositaria/canal-com-investidores/integracoes-da-area-do-investidor-apis/)
e [OC 177/2024](https://b3.com.br/data/files/D8/E6/92/49/4BAB39107A1B8539AC094EA8/OC%20177-2024%20PRE%20Nova%20tarifacao%20-%20APIs%20Area%20do%20Investidor%20da%20B3%20(PT).pdf).

Como o Decision Board agora é hospedado, a API deixa de conflitar com a arquitetura.
Ela continua fora por custo, contrato e aprovação, e volta à pauta quando o
número de usuários justificar a licença. O importador de arquivos deve
produzir o mesmo modelo interno que a API produziria, para que a troca de
fonte não mude as análises.

### Regras do importador

- Upload autenticado, com limite de tamanho, tipos aceitos (XLSX e CSV),
  leitura sem macros nem fórmulas e recusa de layout desconhecido, como exige o
  `AGENTS.md` para endpoints de upload.
- O arquivo original não é guardado. O servidor grava só as linhas
  normalizadas e descarta conta, CPF, nome e outros identificadores pessoais.
- Dono derivado do `userId` da sessão, nunca do corpo da requisição.
- Deduplicação por instituição, código e data, com relatório do que foi
  ignorado.
- Preço importado da B3 é um preço observado com data. Ele não sobrescreve um
  preço informado manualmente sem escolha explícita.
- A posição importada é comparada com a posição derivada das movimentações.
  Diferenças viram pendências de reconciliação, nunca ajuste silencioso.
- Nenhum login automatizado e nenhuma coleta na área logada. A pessoa baixa
  os arquivos.

## Caixa declarado

No Decision Board, a pessoa informa todo mês:

- o valor do aporte do mês e a data do recebimento;
- uma folga opcional, que não entra no aporte;
- a divisão do aporte entre Meta e Renda variável;
- quando quiser, o saldo dos ativos fora da B3 (cofrinho, fundo aberto).

Um lembrete mensal pede a atualização. Se ele vencer, o Aporte mostra o caixa
como desatualizado e não distribui um valor antigo como se fosse atual.

## Dados públicos de mercado

O servidor coleta as fontes públicas num job agendado (`pg-boss`), guarda
cada cópia com data e origem e serve as séries ao aplicativo. Os tickers
consultados ficam no servidor, como qualquer outro dado da carteira.

| Fonte | Uso | Formato | Observação |
| --- | --- | --- | --- |
| BCB SGS | CDI, Selic, IPCA e outras séries | API JSON | Séries longas exigem janela de datas |
| BCB Olinda (Focus) | Expectativas de Selic e IPCA | OData JSON | — |
| Calendário do Copom | Datas das reuniões | Publicado pelo BCB | Conferir o formato |
| Tesouro Transparente | Preços e taxas diárias do Tesouro Direto | CSV de ~14 MB | Licença ODbL |
| ANBIMA | Feriados nacionais | XLS | Curvas e preços indicativos exigem extração manual ou API própria |
| CVM, informe mensal de FII | Patrimônio, cotistas, valor patrimonial da cota e DY mensal | ZIP com CSV | DY agregado, sem valor por cota nem data-com |
| CVM, informe diário de fundos | Cota de fundos abertos | ZIP mensal de ~12 MB | — |
| B3, cadastro de instrumentos | Existência do ticker, lote, fracionário | A verificar | Não confirmado que o arquivo traga lote e fracionário |

Regras:

- Respeitar a licença e os termos de cada fonte. A página de cotações
  históricas da B3 (COTAHIST) proíbe coleta automatizada, então ela **não**
  entra na coleta.
- Uma falha de coleta preserva os dados anteriores e aparece como fonte
  desatualizada.
- O pacote `packages/market-data` é dono dos adaptadores; os relatórios e o
  núcleo não buscam dados de mercado.

### Lacunas sem fonte pública confirmada

- **Histórico de preços ajustado por proventos** para ações, FIIs e ETFs, que é
  a base do teste de correlação. O Yahoo Finance não é oficial, devolveu 429 no
  teste, já trouxe dividendo zerado e retorno suspeito. A proposta é um
  provedor opcional (como o brapi) configurado por variável de ambiente, além
  da importação manual de série. Toda série externa passa pela checagem de
  qualidade descrita no requisito R9.
- **Proventos por cota com data-com** de forma oficial e gratuita. A
  movimentação da B3 traz o recebido; o a receber fica estimado e marcado
  como tal.
- **Fundamentos de FII e ação** (P/VP, liquidez diária, P/L). A CVM cobre parte
  dos FIIs; o restante fica como dado informado ou de provedor opcional.
- **Lote padrão e existência do mercado fracionário.** Sem essa fonte, o
  requisito R10 marca a viabilidade como não verificada.

## Arquitetura do Decision Board

Segue o contrato vigente em `AGENTS.md` e `docs/architecture.md`: Better Auth,
NestJS, Prisma com Postgres, `pg-boss` para jobs, `packages/core` puro e
`packages/market-data` com os adaptadores.

- Dados sensíveis: criptografia em repouso no banco e nos backups, TLS
  obrigatório, nenhuma credencial de corretora ou da B3 guardada.
- Chave Anthropic da pessoa cifrada no servidor, fora dos registros e do
  contexto do modelo.
- Exportação completa e exclusão da conta com todos os dados, como pede a LGPD.
- Isolamento por usuário testado em cada módulo que lê ou grava dados da
  carteira.
- Self-hosting continua possível pela imagem Docker, para quem preferir manter
  os dados no próprio servidor.

### Cadastro guiado do Decision Board

1. Conta e login.
2. Estrutura da carteira: Reserva, Meta e Renda variável, com prazo e alvo de
   cada parte, prazo máximo aceitável e instituições permitidas.
3. Importação da B3: passo a passo ilustrado para baixar posição, movimentação
   e negociação, e envio dos arquivos.
4. Ativos fora da B3: cofrinhos, fundos abertos e outros, com taxa, condição e
   vigência.
5. Caixa do mês: aporte, data do recebimento, folga e divisão.
6. Chave Anthropic, opcional.
7. Primeira revisão: qualidade dos dados, depois a primeira análise.

## Por que a Pluggy não entra

Como fonte de investimentos, a experiência do autor em 10/11/2026 mostrou:

- posição de FII duplicada;
- preço defasado em relação ao mercado;
- rentabilidade vazia, coerente com a documentação, que informa
  `amountProfit` nulo nos conectores do Open Finance;
- o cofrinho de um banco digital ausente;
- uma corretora sem visibilidade.

A B3 cobre o mesmo patrimônio com dado oficial e consolidado. A Pluggy
continua sendo assunto do Ascend Finance, para contas, cartões e transações.

## Fases

| Fase | Entrega | Prova de aceite |
| --- | --- | --- |
| F1 | Teste dos arquivos da B3 | Perguntas da seção "O que a fase F1 precisa confirmar" respondidas com arquivos reais; fixtures sintéticos criados com o mesmo layout |
| F2 | Importador B3 e modelo da carteira | Posição, negociação, movimentação e proventos importados; identificadores pessoais descartados; reconciliação entre posição e movimentação; layout desconhecido recusado; isolamento por usuário testado |
| F3 | Coleta de dados públicos | Tesouro, BCB, ANBIMA e CVM coletados com data e origem; falha preserva o dado anterior |
| F4 | Motor analítico dos requisitos R1 a R10 | Casos sintéticos com resposta conhecida em cada ficha de [analysis-requirements.md](../analysis-requirements.md) |
| F5 | Decision Board: cadastro guiado, revisão mensal e Hoje | Jornada completa no navegador com dados sintéticos |
| F6 | Endurecimento | Modelo de ameaças, criptografia em repouso, exportação e exclusão, guia ilustrado da B3 |

## Riscos

- O servidor passa a guardar dados financeiros: vazamento, LGPD e
  responsabilidade. Mitigação: nenhuma credencial de terceiros, arquivo
  original descartado, identificadores pessoais removidos, criptografia em
  repouso e exclusão completa.
- A B3 pode mudar o layout ou o menu dos extratos. O importador falha de forma
  explícita e os fixtures precisam ser atualizados.
- A importação depende de a pessoa baixar arquivos todo mês. O ritual guiado e
  o lembrete reduzem o atrito, mas não o eliminam.
- Sem fonte oficial de série ajustada, o teste de correlação depende de um
  provedor opcional ou de dados informados.

## Referências

- [Integrações da Área do Investidor (APIs)](https://www.b3.com.br/pt_br/produtos-e-servicos/central-depositaria/canal-com-investidores/integracoes-da-area-do-investidor-apis/)
- [Material da área logada da B3](https://b3.com.br/data/files/15/64/1A/AD/CDD8F710C3D7B7F7AC094EA8/Material_IR22_Area_logada_v4.pdf)
- [Webinar das APIs da B3](https://www.b3.com.br/data/files/99/00/1E/5D/6C39F71026F0F8F7AC094EA8/Material%20Webinar.pdf)
- [Pluggy: investimentos](https://docs.pluggy.ai/docs/investments)
- [Pluggy: cobertura de investimentos no Open Finance](https://docs.pluggy.ai/en/docs/open-finance/investments)
- [Tesouro Transparente: taxas do Tesouro Direto](https://www.tesourotransparente.gov.br/ckan/dataset/taxas-dos-titulos-ofertados-pelo-tesouro-direto)
- [CVM: informe mensal de FII](https://dados.cvm.gov.br/dataset/fii-doc-inf_mensal)
