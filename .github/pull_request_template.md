<!--
FEAT-01 (14-early-warning-routine-features.md): "no pull request template or
checklist in .github/, so nothing shows that the questions are asked."

The source document names "the eight questions for every new feature" but
never actually lists them anywhere in this repo — not in that file, not in
any other audit document, not in .github/. There is nothing to recover here;
the eight questions as originally meant were apparently never written down.

The checklist below is NOT a recovery of that original list. It's built from
the issues that kept recurring across this repo's own audit series (the
database, performance, and production-readiness reviews) — the things that
actually caused P0/P1 findings here before. Replace it with the real eight
questions if/when someone finds or writes them down.
-->

## What does this change?

<!-- One or two sentences. What does a reviewer need to know before reading the diff? -->

## Checklist

- [ ] **Input validation** — is every new field checked for type, range, and length, and does bad input return a 4xx with a clear message instead of a raw 500?
- [ ] **Concurrency** — if this endpoint is called twice at once (a double-click, a retried request), what happens? Is there a unique constraint, an idempotency key, or an optimistic-lock check backing that answer up?
- [ ] **Authorization at the data layer** — is access actually enforced by RLS policy or a `WHERE` clause tied to the caller's identity, not just hidden by the UI?
- [ ] **Growth over time** — does any new list/query stay bounded as the table it reads grows, or will it need pagination added later?
- [ ] **Migration safety** — if this touches the schema, can it deploy and roll back without losing data, and does it avoid breaking a still-running previous version of the code?
- [ ] **Tests** — is there a test that proves the happy path, and one that proves a bad/malicious input is rejected safely?
- [ ] **Observability** — if this breaks in production, what tells anyone it broke — a log line, an error tracked somewhere, a metric? (If nothing does yet, that's a known gap — see `14-early-warning-routine-features.md` — not a blocker for every PR.)
- [ ] **Blast radius** — what's the worst case if this is wrong, and is that acceptable, or does it need a feature flag / staged rollout / extra review?
