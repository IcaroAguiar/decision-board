# Decision Board

This context defines the domain language for the portfolio decision dashboard.

## Language

**User**:
A person who uses Decision Board and owns portfolio-related data.
_Avoid_: AuthUser, Profile, Account

**AuthenticatedUser**:
A **User** whose identity has been confirmed for the current request.
_Avoid_: Session payload, auth account, profile

**AuditableContributionSimulation**:
A deterministic scenario for applying a contribution amount under explicit constraints, prices, lots, and source evidence.
It is not financial advice, a recommendation, or a broker order.
_Avoid_: buy list, recommendation, order execution

**ContributionCandidate**:
An asset considered as an input to an **AuditableContributionSimulation**, already enriched with the price, constraints, metrics, and source references needed for deterministic evaluation.
It is not a persisted market-data snapshot.
_Avoid_: provider row, raw metric snapshot

**TargetWeightGap**:
The distance between an asset's current portfolio weight and its target weight inside an **AuditableContributionSimulation**.
The simulation uses this gap to choose the next whole lot while constraints still pass.
_Avoid_: expected return, score, alpha

**SimulationAuditFinding**:
A traceable explanation of something the simulation blocked, warned about, or left unresolved.
Hard constraints such as missing source evidence, invalid universe membership, price limits, budget, lot size, and concentration block simulated orders.
Unallocated cash can be informational when no valid whole lot remains.
_Avoid_: hidden skip, silent fallback

**AllowedInvestmentUniverse**:
The explicit set of assets or tickers that an **AuditableContributionSimulation** is allowed to consider.
A **ContributionCandidate** outside this universe must be blocked and explained by a **SimulationAuditFinding**.
_Avoid_: implicit candidate list, provider universe

**MetricSourceRef**:
Source evidence attached to one specific candidate metric used by an **AuditableContributionSimulation**.
If a metric affects inclusion, blocking, or ordering, that metric must carry a source reference in the simulation input.
_Avoid_: generic candidate source, unsourced fact

**MinimumDecisionMetricSet**:
The first core slice's metric set for contribution simulation: price, lot size, target weight, risk category, segment, liquidity, and concentration.
Broader FII metrics such as P/VP, dividend yield, vacancy, manager, and dividend base date belong to the later FII metrics snapshot model.
_Avoid_: full FII analysis in the core allocation slice

## Relationships

- A **User** owns portfolio-related data.
- An **AuthenticatedUser** is a **User** in the context of one request.
- A **ContributionCandidate** can be included or blocked by an **AuditableContributionSimulation**.
- An **AuditableContributionSimulation** explains blocked or unresolved outcomes with **SimulationAuditFinding** entries.
- An **AllowedInvestmentUniverse** bounds which **ContributionCandidate** entries can be simulated.
- A **ContributionCandidate** carries **MetricSourceRef** entries for each metric that affects simulation behavior.

## Example dialogue

> **Dev:** "Should an auth account and an app profile be different domain concepts?"
> **Domain expert:** "No. For the MVP, call the person who owns the data a **User**."
>
> **Dev:** "Should portfolio modules receive the full auth session?"
> **Domain expert:** "No. They should receive an **AuthenticatedUser** with the minimum identity needed for ownership checks."

## Flagged ambiguities

- "account" can mean login credentials, cash account, or product user; use **User** for the person who owns data.
- "session" can mean auth storage or request identity; use **AuthenticatedUser** for the request identity passed to domain-facing code.
- "order" in contribution planning means a simulated order inside an **AuditableContributionSimulation**, never a broker order.
