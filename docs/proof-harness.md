# UI de prova de fluxo (temporária)

A app em `apps/web` é um **harness operacional** para exercitar a API ponta a
ponta. Não é entrega de UX de produto (dashboard, cards de estratégia, design
system ou navegação fina ficam para fase posterior).

Banner na própria UI: “Prova de fluxo / temporária — não é UX de produto.”

## Fluxo feliz (manual)

Pré-requisitos: Postgres saudável, `.env` com `BETTER_AUTH_SECRET`,
`WEB_ORIGIN=http://localhost:5173`, API em `http://localhost:3001`, web em
`http://localhost:5173` (preferir `localhost` ao host `127.0.0.1` para o cookie
bater no mesmo site lógico).

1. Abrir a web; confirmar API base `http://localhost:3001`.
2. **Sign-up** (ou sign-in) — sessão via cookie Better Auth; e-mail aparece na tela.
3. **Criar portfolio** pelo seletor (não colar UUID no caminho principal).
4. **Carregar workspace**.
5. Criar **asset** → **snapshot de preço** (manual; refresh só se provider ligado).
6. Criar **posição** e **conta de caixa**.
7. Criar **plano de aporte** e selecioná-lo.
8. **Criar ciclo** do mês → confirmar valor/estratégia → **gerar relatório**.
9. **Carregar `current.json`** e conferir histórico.

Gates automatizados: `pnpm lint`, `typecheck`, `test`, `build`, `smoke:api` no
workflow CI. O ratchet agentic em `docs/ai/quality-gate/` está depreciado.
Browser E2E completo não faz parte desta janela.
