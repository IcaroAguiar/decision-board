# Decision Board

This context defines the domain language for the portfolio decision dashboard.

## Language

**User**:
A person who uses Decision Board and owns portfolio-related data.
_Avoid_: AuthUser, Profile, Account

**AuthenticatedUser**:
A **User** whose identity has been confirmed for the current request.
_Avoid_: Session payload, auth account, profile

## Relationships

- A **User** owns portfolio-related data.
- An **AuthenticatedUser** is a **User** in the context of one request.

## Example dialogue

> **Dev:** "Should an auth account and an app profile be different domain concepts?"
> **Domain expert:** "No. For the MVP, call the person who owns the data a **User**."
>
> **Dev:** "Should portfolio modules receive the full auth session?"
> **Domain expert:** "No. They should receive an **AuthenticatedUser** with the minimum identity needed for ownership checks."

## Flagged ambiguities

- "account" can mean login credentials, cash account, or product user; use **User** for the person who owns data.
- "session" can mean auth storage or request identity; use **AuthenticatedUser** for the request identity passed to domain-facing code.
