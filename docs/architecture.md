# Arquitetura do Decision Board

**Atualização:** 2026-11-13. **Estado:** contrato vigente para implementar a
visão do [plano do produto](product-plan.md). As fronteiras, a stack e o motor
analítico estão decididos. As fichas de análise e o layout dos arquivos da B3
ainda são propostas: as fichas aguardam revisão, e o layout depende da fase F1,
com arquivos reais.

Este documento substitui a arquitetura da visão anterior, que continua no
histórico do Git. As decisões de produto estão no plano do produto; as fontes
de dados, no [plano de fontes](plan/2026-11-10-fontes-de-dados.md); e os
métodos de cada análise, nas fichas de
[analysis-requirements.md](analysis-requirements.md).

## 1. O que o produto é

O Decision Board acompanha investimentos de uma pessoa e a ajuda a decidir o
que fazer com o aporte do mês e com a carteira. É um aplicativo hospedado e
multiusuário; quem preferir manter os dados no próprio servidor pode
instalá-lo pela imagem Docker.

O produto não é corretora, não envia ordens e não faz recomendação automática.
A IA monta propostas fundamentadas em cálculos verificáveis. Quando a pessoa
aprova uma proposta, ela vira um plano de operação, que a pessoa executa na
corretora. A importação seguinte dos arquivos da B3 confere o que de fato
aconteceu.

Gastos, contas correntes e cartões ficam fora do escopo.

## 2. Princípios

1. **Cálculo em código, explicação na IA.** Todo número de uma análise sai de
   código versionado e testado em `packages/core`. A IA escolhe a análise, lê
   o resultado e o explica, mas nunca produz o número.
2. **Natureza e data em cada valor.** Um valor é informado pela pessoa,
   observado numa fonte ou estimado por um método, e sempre carrega fonte e
   data de referência.
3. **Dado ausente não vira zero.** Uma soma com parte ausente é parcial e diz
   o que faltou; uma análise sem entrada suficiente fica inconclusiva.
4. **Reprodutibilidade.** Cada resultado guarda método e versão, entradas,
   premissas, fontes e o que não foi verificado.
5. **Fontes opcionais.** O cadastro manual está sempre disponível. Provedores
   externos são adaptadores opcionais e nunca dependências do núcleo.
6. **Nenhuma ordem.** Nenhuma API de corretora, nenhum login automatizado em
   contas financeiras e nenhuma coleta em área logada.

## 3. Stack

| Camada | Escolha |
| --- | --- |
| Web | React com Vite |
| API | NestJS com TypeScript |
| Autenticação | Better Auth, com sessão em cookie |
| Banco | PostgreSQL com Prisma e migrations |
| Jobs | `pg-boss` no mesmo Postgres |
| Motor analítico | TypeScript puro em `packages/core` |
| Monorepo | pnpm workspaces |
| Deploy | Docker Compose atrás de proxy reverso com HTTPS |

O motor não usa bibliotecas numéricas: os requisitos R1 a R10 usam álgebra
simples. Python só volta à pauta se Monte Carlo ou a otimização exigirem, e
nesse caso não terá autoridade sobre carteira, estratégia ou permissões.

## 4. Visão lógica

```text
            Web (React)            CLI (futura)
                 └──────┬──────────────┘
                        │ HTTPS, sessão Better Auth
┌───────────────────────▼────────────────────────────┐
│ API (NestJS)                                       │
│  auth · carteiras · instrumentos · posições        │
│  importação B3 · caixa declarado · estratégia      │
│  análises · propostas e decisões · relatórios      │
└───────┬──────────────────┬───────────────┬─────────┘
        │ Prisma           │ chama         │ chama
┌───────▼───────┐  ┌───────▼────────┐  ┌───▼──────────────┐
│ PostgreSQL    │  │ packages/core  │  │ packages/        │
│ dados + jobs  │  │ motor puro     │  │ market-data      │
└───────▲───────┘  └────────────────┘  │ fontes públicas  │
        │                              │ e provedores     │
┌───────┴────────┐                     └──────────────────┘
│ pg-boss        │  coleta pública, lembretes, verificações
└────────────────┘
```

A API orquestra: lê os dados do usuário autenticado, busca as séries já
coletadas, chama o motor e grava o resultado com tudo o que o torna
reproduzível. O motor não conhece banco, HTTP nem relógio; recebe tudo como
argumento, inclusive a data de referência.

## 5. Pacotes e responsabilidades

| Pacote | Responsabilidade | Não pode |
| --- | --- | --- |
| `packages/core` | Contratos de proveniência, calendário de dias úteis, envelope de análise e os métodos das fichas de análise, à medida que forem implementados | Depender de React, NestJS, Prisma, Better Auth, HTTP, variáveis de ambiente ou relógio |
| `packages/types` | Tipos e enums compartilhados entre API, web e pacotes | Conter lógica |
| `packages/market-data` | Adaptadores das fontes públicas (BCB, Tesouro Transparente, ANBIMA, CVM) e dos provedores opcionais | Ser chamado pelo core ou pelos relatórios |
| `packages/reports` | Exportação em Markdown e JSON a partir do mesmo resultado gravado, com `schemaVersion` | Buscar dados de mercado ou recalcular |
| `packages/strategies` | Avaliadores de limites usados pelas análises de alocação (hoje ainda exporta os cinco perfis da visão anterior) | Definir perfis fixos de investidor |
| `apps/api` | Persistência, autenticação, importação, jobs e orquestração | Calcular análises fora do core |
| `apps/web` | Telas aprovadas no design | Calcular análises ou decidir permissões |

Os perfis fixos de estratégia da visão anterior serão aposentados. A
estratégia passa a ser da pessoa, com versão (R12).

## 6. Motor analítico

O motor fica em `packages/core` e se organiza por análise:

| Módulo | Requisitos | Entradas principais |
| --- | --- | --- |
| Contratos | Base de todos | Valor com natureza, fonte e data; soma com cobertura; idade do dado; calendário de dias úteis; envelope de resultado |
| Renda fixa | R1, R2 | Taxas, indexadores, vencimentos, caminho do CDI, tabelas de IR e custódia |
| Risco | R3 | Séries mensais de retorno total e pesos da carteira |
| Alocação | R7, R8 | Posições por parte da carteira, alvos e faixas da estratégia, caixa declarado; o R8 recebe a projeção congelada, calculada com o R1 |
| Decisões | R11, R12 | Proposta, referências às análises que a sustentam, estratégia versionada |
| Cenários (previsto, P4) | Otimização, backtests, estresse, Monte Carlo e sensibilidade | Métodos e hipóteses registrados, semente e configuração de cada simulação, dados disponíveis em cada data |

Os requisitos R4, R5, R6, R9 (reconciliação) e R10 dependem de fontes que
ainda serão confirmadas e entram depois.

No R11, o core decide só o que é regra pura: por exemplo, se uma proposta de
renda variável tem um resultado do R3 que a sustente. A API garante o resto,
como impedir que uma rotina agendada registre movimentação.

Os backtests da fase P4 exigem dados com disponibilidade temporal: cada série
precisa dizer o que se sabia em cada data, e não apenas o valor revisto de
hoje. A fase P2 prepara esse dado.

### 6.1. Envelope de resultado

Todo método devolve o mesmo envelope:

- método, identificado no catálogo de métodos, e versão;
- versão da estratégia sob a qual a análise rodou, quando houver;
- estado: completo, parcial ou inconclusivo;
- data de referência;
- entradas e premissas usadas;
- fontes, cada uma com data;
- naturezas dos valores usados (informado, observado ou estimado);
- o que não foi verificado;
- achados (informativo, alerta ou bloqueio), com mensagem em português;
- a saída, que é nula quando o resultado é inconclusivo.

Um resultado parcial ou inconclusivo sempre explica o motivo. Outras partes do
sistema citam um resultado por uma referência (identificador, método, data,
estado, versão da estratégia e os ativos para os quais ela produziu resultado
utilizável), e é por ela que uma decisão aponta as
análises que a sustentam.

### 6.2. Política numérica

O motor usa `number` (ponto flutuante de 64 bits) e documenta a tolerância de
cada método nos testes de aceite. Valores monetários gravados no banco usam
`Decimal`, e a conversão acontece na fronteira da API. Taxas e percentuais são
frações decimais (0,1375 representa 13,75%), e o motor só arredonda na
apresentação. Os cálculos de carteira herdados da visão anterior
ainda usam pontos percentuais e arredondam valores; serão
migrados para a convenção nova.

As datas são datas de calendário ISO (`AAAA-MM-DD`), tratadas em UTC. Os dias
úteis seguem a convenção de intervalo semiaberto: conta-se o dia inicial e não
se conta o final. Os feriados chegam ao motor como lista, junto com o
período que essa lista cobre; o motor não os conhece por conta própria e
recusa datas fora desse período.

### 6.3. Aceite

Cada método tem os casos sintéticos da sua ficha, com resposta conhecida e
tolerância. Nenhum valor financeiro real entra no repositório, nem em testes
nem em fixtures.

## 7. Dados

### 7.1. Origem

| Dado | Origem | Natureza |
| --- | --- | --- |
| Posições, negociações, movimentações e proventos recebidos | Arquivos da Área do Investidor da B3, enviados pela pessoa | Observado, com data de referência |
| Custo anterior a 01/11/2019 ou fora da B3 | Cadastro manual | Informado |
| Cofrinhos, fundos abertos, previdência e cripto | Cadastro manual com taxa, condição e vigência | Informado |
| Caixa do mês para aporte | Declaração mensal no app | Informado, com data |
| Preços, taxas, índices e séries públicas | Coleta pelo servidor | Observado, com fonte e data |
| Proventos a receber | Estimativa pelo histórico | Estimado |

A Pluggy não faz parte do Decision Board. A API paga da Área do Investidor da
B3 fica fora até que o número de usuários justifique a licença; o importador
de arquivos deve produzir o mesmo modelo interno que ela produziria.

### 7.2. Modelo a evoluir

O esquema atual veio da visão anterior. As mudanças previstas, que exigem
migration e entram depois do motor, são:

- **Posição:** data de referência, natureza, instituição e conta, e a posição
  derivada das movimentações para reconciliação.
- **Movimentações e negociações:** novas tabelas alimentadas pelo importador.
- **Instrumentos:** o catálogo de ativos ganha as classes de renda fixa e
  Tesouro, além de lote e fracionário quando houver fonte. A escrita no
  catálogo compartilhado deixa de ser livre para qualquer usuário.
- **Caixa declarado:** o plano e o ciclo de aporte passam a guardar data de
  recebimento, folga e divisão entre Meta e Renda variável, e o ciclo marca o
  caixa como desatualizado quando o lembrete vence.
- **Ativos fora da B3:** as contas de caixa da visão anterior passam a
  representar cofrinhos e contas remuneradas, com taxa, condição e vigência,
  e deixam de se misturar com o caixa do aporte.
- **Estrutura da carteira:** Reserva, Meta e Renda variável, com função, alvo
  e prazo de cada parte.
- **Análises e decisões:** o resultado completo de cada análise, as propostas,
  os planos de operação e o registro de decisões.

## 8. Importação da B3

- Upload autenticado, com limite de tamanho, apenas XLSX e CSV, leitura sem
  macros nem fórmulas e recusa explícita de layout desconhecido.
- O arquivo original não é guardado. O servidor grava só as linhas
  normalizadas e descarta conta, CPF, nome e outros identificadores pessoais.
- Deduplicação por instituição, código e data, com relatório do que foi
  ignorado.
- Um preço importado é observado e datado; ele não sobrescreve um preço
  informado sem escolha explícita da pessoa.
- Diferenças entre a posição importada e a derivada das movimentações viram
  pendências de reconciliação, nunca ajuste silencioso.

## 9. Coleta de dados públicos

Um job do `pg-boss` coleta as fontes públicas, guarda cada cópia com data e
origem e as serve ao app. Uma falha preserva o dado anterior e marca a fonte
como desatualizada. A coleta respeita a licença de cada fonte; a página de
cotações históricas da B3, que proíbe coleta automatizada, fica de fora.

## 10. IA

A pessoa fornece a própria chave da Anthropic, que fica cifrada no servidor,
fora dos registros e fora do contexto do modelo. A IA chama as análises como
ferramentas e recebe o envelope de resultado. Uma afirmação numérica sem
resultado calculado aparece como opinião não verificada. Rotinas agendadas só
verificam, calculam e alertam; nenhuma delas registra movimentação. Os
detalhes ficam para a fase P5 do plano do produto.

## 11. Segurança e privacidade

- HTTPS obrigatório em produção, com cookies `httpOnly`, `secure` e `sameSite`
  adequados.
- Rate limit em autenticação e rotas sensíveis; CORS restrito.
- Dono de todo dado derivado do `userId` da sessão. Nenhuma rota aceita
  `userId` no corpo ou na query, e todo repositório de dado do usuário recebe
  `userId` explicitamente.
- Nenhuma credencial de corretora, banco ou B3 é pedida ou guardada.
- Logs sem tokens, cookies, CPF, senhas ou cargas de autenticação.
- Criptografia em repouso no banco e nos backups, exportação completa e
  exclusão da conta com todos os dados, como pede a LGPD.
- Teste de isolamento entre usuários em cada módulo que lê ou grava dados da
  carteira.

## 12. Qualidade

Hoje o `quality-gate` de cada PR roda lint, typecheck, migrations, todos os
testes com Postgres, cobertura, o smoke da API e o build. Os comandos e o
ambiente estão em [testing.md](testing.md). O motor analítico não precisa de
banco: seus testes rodam sem Postgres e servem de verificação rápida durante
o desenvolvimento.

## 13. Deploy

Docker Compose com Postgres, API e web, atrás de um proxy reverso com HTTPS.
O backup diário do Postgres é obrigatório, com retenção mínima de sete dias e
restauração testada antes de abrir o produto a outras pessoas.
